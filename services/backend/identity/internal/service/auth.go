// Package service содержит бизнес-логику identity-сервиса.
// Не зависит от HTTP — handler адаптирует HTTP-запросы к этим методам.
package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/runningecosystem/backend/identity/internal/domain"
	"github.com/runningecosystem/backend/identity/internal/repository"
	"github.com/runningecosystem/backend/pkg/auth"
)

// AuthService — регистрация, login, refresh, logout.
type AuthService struct {
	users   repository.UserRepo
	tokens  repository.RefreshTokenRepo
	signer  *auth.Signer
	bcryptC int
}

func NewAuthService(users repository.UserRepo, tokens repository.RefreshTokenRepo, signer *auth.Signer) *AuthService {
	return &AuthService{
		users:   users,
		tokens:  tokens,
		signer:  signer,
		bcryptC: bcrypt.DefaultCost,
	}
}

// TokenPair — пара выпущенных токенов.
type TokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int64 // секунды до истечения access-токена
}

// Register создаёт пользователя и сразу выпускает пару токенов.
// Email нормализуется (lowercase, trim) и валидируется.
// Password проверяется на минимальную длину 8 символов (без сложных правил
// для прототипа — добавим в Phase 4 настройки безопасности).
//
// Идемпотентность: повторная регистрация с тем же email вернёт ErrEmailAlreadyExists.
func (s *AuthService) Register(ctx context.Context, email, password, displayName, userAgent string) (*domain.User, *TokenPair, error) {
	email = normalizeEmail(email)
	if err := validateEmail(email); err != nil {
		return nil, nil, err
	}
	if err := validatePassword(password); err != nil {
		return nil, nil, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), s.bcryptC)
	if err != nil {
		return nil, nil, fmt.Errorf("hash password: %w", err)
	}

	u := &domain.User{
		Email:        email,
		PasswordHash: string(hash),
		DisplayName:  strings.TrimSpace(displayName),
	}
	if err := s.users.Create(ctx, u); err != nil {
		return nil, nil, err
	}

	pair, err := s.issuePair(ctx, u.ID, userAgent)
	if err != nil {
		return nil, nil, err
	}
	return u, pair, nil
}

// Login проверяет credentials и возвращает пару токенов.
func (s *AuthService) Login(ctx context.Context, email, password, userAgent string) (*domain.User, *TokenPair, error) {
	email = normalizeEmail(email)

	u, err := s.users.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, domain.ErrUserNotFound) {
			// Не различаем "пользователь не найден" и "пароль неверен" — защита от user enumeration.
			return nil, nil, domain.ErrInvalidCredentials
		}
		return nil, nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return nil, nil, domain.ErrInvalidCredentials
	}

	pair, err := s.issuePair(ctx, u.ID, userAgent)
	if err != nil {
		return nil, nil, err
	}
	return u, pair, nil
}

// Refresh ротирует refresh-token: revoke старый и issue новую пару.
// Если предоставленный refresh уже revoked / expired — отдаём ошибку.
func (s *AuthService) Refresh(ctx context.Context, refreshToken, userAgent string) (*TokenPair, error) {
	claims, err := s.signer.VerifyRefresh(refreshToken)
	if err != nil {
		return nil, domain.ErrInvalidCredentials
	}

	hash := hashToken(refreshToken)
	stored, err := s.tokens.GetByHash(ctx, hash)
	if err != nil {
		return nil, err
	}
	if stored.RevokedAt != nil {
		return nil, domain.ErrTokenRevoked
	}
	if time.Now().After(stored.ExpiresAt) {
		return nil, domain.ErrTokenExpired
	}
	if stored.UserID != claims.UserID {
		return nil, domain.ErrInvalidCredentials
	}

	if err := s.tokens.Revoke(ctx, stored.ID, time.Now().UTC()); err != nil {
		return nil, err
	}
	return s.issuePair(ctx, claims.UserID, userAgent)
}

// Logout отзывает конкретный refresh-токен. Не падает если токена нет (idempotent).
func (s *AuthService) Logout(ctx context.Context, refreshToken string) error {
	hash := hashToken(refreshToken)
	stored, err := s.tokens.GetByHash(ctx, hash)
	if err != nil {
		if errors.Is(err, domain.ErrTokenNotFound) {
			return nil
		}
		return err
	}
	if stored.RevokedAt != nil {
		return nil
	}
	return s.tokens.Revoke(ctx, stored.ID, time.Now().UTC())
}

// Me — получить пользователя по ID (используется в /me endpoint после JWT-валидации).
func (s *AuthService) Me(ctx context.Context, userID string) (*domain.User, error) {
	return s.users.GetByID(ctx, userID)
}

// issuePair выпускает access+refresh, refresh сохраняется захэшированным.
func (s *AuthService) issuePair(ctx context.Context, userID, userAgent string) (*TokenPair, error) {
	access, err := s.signer.IssueAccess(userID)
	if err != nil {
		return nil, err
	}
	refresh, err := s.signer.IssueRefresh(userID)
	if err != nil {
		return nil, err
	}
	if err := s.tokens.Create(ctx, &domain.RefreshToken{
		UserID:    userID,
		TokenHash: hashToken(refresh),
		ExpiresAt: time.Now().Add(auth.RefreshTokenTTL),
		UserAgent: userAgent,
	}); err != nil {
		return nil, err
	}
	return &TokenPair{
		AccessToken:  access,
		RefreshToken: refresh,
		ExpiresIn:    int64(auth.AccessTokenTTL.Seconds()),
	}, nil
}

// hashToken — SHA-256 чтобы не хранить токен в plain. Не bcrypt: refresh
// уже подписан JWT и проверка на уникальность по hash должна быть быстрой.
func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// Валидаторы.

func normalizeEmail(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

func validateEmail(s string) error {
	if s == "" {
		return errors.New("email: required")
	}
	if _, err := mail.ParseAddress(s); err != nil {
		return errors.New("email: invalid format")
	}
	return nil
}

func validatePassword(s string) error {
	if len(s) < 8 {
		return errors.New("password: must be at least 8 characters")
	}
	if len(s) > 256 {
		return errors.New("password: too long (max 256)")
	}
	return nil
}
