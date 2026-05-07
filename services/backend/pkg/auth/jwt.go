// Package auth содержит общие утилиты аутентификации (JWT issue/verify),
// которые используются и identity-сервисом и API Gateway / другими сервисами.
//
// Этот пакет НЕ зависит от Postgres или HTTP-фреймворка — только stdlib + jwt.
package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// AccessTokenTTL — срок жизни access-токена. ТЗ §5.4 — 15 минут.
const AccessTokenTTL = 15 * time.Minute

// RefreshTokenTTL — срок жизни refresh-токена. ТЗ §5.4 — 30 дней.
const RefreshTokenTTL = 30 * 24 * time.Hour

// Issuer — значение iss в JWT.
const Issuer = "running-ecosystem.identity"

// Claims расширяет стандартные RegisteredClaims user_id'ом.
type Claims struct {
	jwt.RegisteredClaims
	UserID string `json:"uid"`
	// Type различает access ("access") и refresh ("refresh") токены.
	// Refresh-токены не должны проходить проверку как access — поэтому
	// VerifyAccess отдельно проверяет Type=="access".
	Type string `json:"typ"`
}

// Signer выпускает и верифицирует JWT с симметричным ключом (HS256).
// Ключ берётся из ENV (JWT_SECRET) — никогда не хардкодим.
type Signer struct {
	secret []byte
}

// NewSigner создаёт Signer с секретом. Минимум 32 байта ради безопасности.
func NewSigner(secret []byte) (*Signer, error) {
	if len(secret) < 32 {
		return nil, errors.New("auth: jwt secret must be at least 32 bytes")
	}
	return &Signer{secret: secret}, nil
}

// IssueAccess создаёт access-токен для пользователя.
func (s *Signer) IssueAccess(userID string) (string, error) {
	return s.issue(userID, "access", AccessTokenTTL)
}

// IssueRefresh создаёт refresh-токен.
func (s *Signer) IssueRefresh(userID string) (string, error) {
	return s.issue(userID, "refresh", RefreshTokenTTL)
}

func (s *Signer) issue(userID, tokenType string, ttl time.Duration) (string, error) {
	now := time.Now()
	jti, err := randomJTI()
	if err != nil {
		return "", err
	}
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    Issuer,
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			NotBefore: jwt.NewNumericDate(now),
			ID:        jti,
		},
		UserID: userID,
		Type:   tokenType,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(s.secret)
	if err != nil {
		return "", fmt.Errorf("auth: sign token: %w", err)
	}
	return signed, nil
}

// randomJTI — 16-байтовый random hex (128 бит энтропии).
// Гарантирует уникальность даже двух токенов с одинаковыми iat/exp/sub.
func randomJTI() (string, error) {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", fmt.Errorf("auth: random jti: %w", err)
	}
	return hex.EncodeToString(buf[:]), nil
}

// VerifyAccess валидирует access-токен и возвращает claims.
func (s *Signer) VerifyAccess(tokenString string) (*Claims, error) {
	return s.verify(tokenString, "access")
}

// VerifyRefresh валидирует refresh-токен.
func (s *Signer) VerifyRefresh(tokenString string) (*Claims, error) {
	return s.verify(tokenString, "refresh")
}

func (s *Signer) verify(tokenString, expectedType string) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (any, error) {
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("auth: unexpected signing method: %v", t.Header["alg"])
		}
		return s.secret, nil
	}, jwt.WithIssuer(Issuer), jwt.WithExpirationRequired(), jwt.WithLeeway(5*time.Second))
	if err != nil {
		return nil, fmt.Errorf("auth: parse: %w", err)
	}
	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return nil, errors.New("auth: invalid token")
	}
	if claims.Type != expectedType {
		return nil, fmt.Errorf("auth: token type mismatch: got %q, want %q", claims.Type, expectedType)
	}
	return claims, nil
}
