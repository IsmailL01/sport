// Passwordless OTP login. Phase 8 / M4.
//
// Flow:
//   POST /auth/request-code  → server generates 6-digit code, stores
//     в auth_otp_codes с expires_at = now + 10 min, "doc": лог
//     stdout в dev (mock SMTP); production — SMTP/SES в Phase N+.
//   POST /auth/login-with-code → server validates code:
//     - active (not used, not expired)
//     - matches submitted code
//     - attempts < 5 (anti-bruteforce)
//     После success — mark used, find-or-create user, issue TokenPair.
//
// User auto-create: если /auth/request-code приходит с unknown email,
// мы НЕ создаём user сразу — только при successful login-with-code.
// Это предотвращает email enumeration attack (стандартная практика).
package service

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/binary"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/runningecosystem/backend/identity/internal/domain"
	"github.com/runningecosystem/backend/identity/internal/repository/postgres"
)

// CodeTTL — время жизни OTP (10 минут).
const CodeTTL = 10 * time.Minute

// MaxOtpAttempts — после стольких неверных submit'ов код деактивируется.
const MaxOtpAttempts = 5

// OtpService — отдельная служба (не путать с AuthService.password flow).
type OtpService struct {
	otps    *postgres.OtpRepo
	users   *postgres.UserRepo
	tokens  *postgres.RefreshTokenRepo
	auth    *AuthService
}

func NewOtpService(
	otps *postgres.OtpRepo, users *postgres.UserRepo,
	tokens *postgres.RefreshTokenRepo, auth *AuthService,
) *OtpService {
	return &OtpService{otps: otps, users: users, tokens: tokens, auth: auth}
}

// RequestCode — сгенерировать новый код для email.
//
// Возвращает code только в dev mode (для smoke); production обнуляется.
// Логирует код в stdout — в dev/staging достаточно. SMTP — Phase N+.
func (s *OtpService) RequestCode(ctx context.Context, email string, devMode bool) (devCode string, err error) {
	email = normalizeEmail(email)
	if err := validateEmail(email); err != nil {
		return "", err
	}
	code, err := generate6Digits()
	if err != nil {
		return "", err
	}
	if _, err := s.otps.Create(ctx, email, code, time.Now().Add(CodeTTL)); err != nil {
		return "", fmt.Errorf("otp create: %w", err)
	}
	slog.InfoContext(ctx, "otp issued",
		"email", email,
		// Dev-mode logging only. В production не логируем code.
		"code", code,
	)
	if devMode {
		return code, nil
	}
	return "", nil
}

// LoginWithCode — verify code и issue token pair. Создаёт user если не было.
func (s *OtpService) LoginWithCode(
	ctx context.Context, email, code, userAgent string,
) (*domain.User, *TokenPair, error) {
	email = normalizeEmail(email)
	if err := validateEmail(email); err != nil {
		return nil, nil, err
	}
	if len(code) != 6 {
		return nil, nil, domain.ErrInvalidCredentials
	}

	otp, err := s.otps.GetActive(ctx, email)
	if err != nil {
		if errors.Is(err, postgres.ErrOtpNotFound) {
			return nil, nil, domain.ErrInvalidCredentials
		}
		return nil, nil, err
	}

	// Constant-time compare.
	if subtle.ConstantTimeCompare([]byte(otp.Code), []byte(code)) != 1 {
		attempts, _ := s.otps.BumpAttempts(ctx, otp.ID)
		if attempts >= MaxOtpAttempts {
			// Mark used → no further attempts; user requests new code.
			_ = s.otps.MarkUsed(ctx, otp.ID)
		}
		return nil, nil, domain.ErrInvalidCredentials
	}

	// Code matched — mark used (idempotent).
	if err := s.otps.MarkUsed(ctx, otp.ID); err != nil {
		return nil, nil, err
	}

	// Find or create user. Password-less пользователи имеют пустой
	// password_hash; могут позже установить через separate endpoint.
	user, err := s.users.GetByEmail(ctx, email)
	if err != nil {
		if !errors.Is(err, domain.ErrUserNotFound) {
			return nil, nil, err
		}
		// Create stub user. display_name = email prefix; настраивается
		// в post-auth wizard (Phase M4 mobile).
		user = &domain.User{
			Email:        email,
			PasswordHash: "", // passwordless
			DisplayName:  defaultDisplayName(email),
			Locale:       "ru-RU",
			Timezone:     "Europe/Moscow",
		}
		if err := s.users.Create(ctx, user); err != nil {
			return nil, nil, fmt.Errorf("create user: %w", err)
		}
	}

	pair, err := s.auth.issuePair(ctx, user.ID, userAgent)
	if err != nil {
		return nil, nil, err
	}
	return user, pair, nil
}

func generate6Digits() (string, error) {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	n := binary.BigEndian.Uint32(b[:]) % 1_000_000
	return fmt.Sprintf("%06d", n), nil
}

func defaultDisplayName(email string) string {
	for i, c := range email {
		if c == '@' {
			return email[:i]
		}
	}
	return email
}
