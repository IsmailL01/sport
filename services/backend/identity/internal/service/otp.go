// Passwordless OTP login. Phase 8 / M4.
//
// Flow:
//
//	POST /auth/request-code  → server generates 6-digit code, stores
//	  в auth_otp_codes с expires_at = now + 10 min, "doc": лог
//	  stdout в dev (mock SMTP); production — SMTP/SES в Phase N+.
//	POST /auth/login-with-code → server validates code:
//	  - active (not used, not expired)
//	  - matches submitted code
//	  - attempts < 5 (anti-bruteforce)
//	  После success — mark used, find-or-create user, issue TokenPair.
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
	otps   *postgres.OtpRepo
	users  *postgres.UserRepo
	tokens *postgres.RefreshTokenRepo
	auth   *AuthService
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
	logOTPIssued(ctx, email, code, devMode)
	if devMode {
		return code, nil
	}
	return "", nil
}

// logOTPIssued — D-13 fix (OBS-04). Прод-путь больше не эмитит `code`
// attribute вообще; единственная эмиссия — через slog.DebugContext под
// `if devMode { ... }`, которая (a) дропается на baseline LOG_LEVEL=info,
// (b) даже на LOG_LEVEL=debug проходит через pkg/observability PIIDenyList
// который ронит attr "code" entirely. Defense-in-depth (D-13).
//
// Extracted из RequestCode для unit-testing call-shape без stand-up'a
// Postgres (single-purpose helper testable via bytes.Buffer slog capture).
func logOTPIssued(ctx context.Context, email, code string, devMode bool) {
	slog.InfoContext(ctx, "otp issued", "email", email)
	if devMode {
		// LOG_LEVEL=debug gates emission AT THE HANDLER level. Even if
		// LOG_LEVEL=debug is accidentally promoted to prod, the
		// pkg/observability slog handler's PIIDenyList drops the "code"
		// attr from the output line — caller has zero leakage surface.
		slog.DebugContext(ctx, "otp dev-mode echo", "email", email, "code", code)
	}
}

// LoginWithCode — verify code и issue token pair. Создаёт user если не было.
//
// devMode:
//   - false (production): strict — code must match active OTP, attempts < 5
//   - true: ANY 6-digit code → pass (smoke / APK distribution / mobile QA).
//     Анти-bruteforce + email enumeration защита сохраняются (TTL/used_at
//     всё ещё проверяются если active row найден — но не fail если нет).
//
// Возвращает isNew=true если был создан новый user (для onboarding flow).
func (s *OtpService) LoginWithCode(
	ctx context.Context, email, code, userAgent string, devMode bool,
) (*domain.User, *TokenPair, bool, error) {
	email = normalizeEmail(email)
	if err := validateEmail(email); err != nil {
		return nil, nil, false, err
	}
	if len(code) != 6 {
		return nil, nil, false, domain.ErrInvalidCredentials
	}
	if !isAllDigits(code) {
		return nil, nil, false, domain.ErrInvalidCredentials
	}

	otp, err := s.otps.GetActive(ctx, email)
	if err != nil {
		if errors.Is(err, postgres.ErrOtpNotFound) {
			if devMode {
				// Dev-bypass: no active OTP row → accept anyway. Smoke
				// и mobile-tester smogut логиниться даже не нажав
				// «отправить код».
				slog.WarnContext(ctx, "otp dev-bypass: no active code, accepting", "email", email)
			} else {
				return nil, nil, false, domain.ErrInvalidCredentials
			}
		} else {
			return nil, nil, false, err
		}
	}

	// Strict-mode compare (production OR dev with real OTP row).
	if otp != nil {
		if subtle.ConstantTimeCompare([]byte(otp.Code), []byte(code)) != 1 {
			if devMode {
				slog.WarnContext(ctx, "otp dev-bypass: wrong code accepted", "email", email)
				// Не bump attempts в DevMode (чтобы не запирать тестера).
			} else {
				attempts, _ := s.otps.BumpAttempts(ctx, otp.ID)
				if attempts >= MaxOtpAttempts {
					// Mark used → no further attempts; user requests new code.
					_ = s.otps.MarkUsed(ctx, otp.ID)
				}
				return nil, nil, false, domain.ErrInvalidCredentials
			}
		}
		// Code matched (или dev-bypass) — mark used (idempotent).
		if err := s.otps.MarkUsed(ctx, otp.ID); err != nil {
			return nil, nil, false, err
		}
	}

	// Find or create user. Password-less пользователи имеют пустой
	// password_hash; могут позже установить через separate endpoint.
	user, err := s.users.GetByEmail(ctx, email)
	isNew := false
	if err != nil {
		if !errors.Is(err, domain.ErrUserNotFound) {
			return nil, nil, false, err
		}
		// Create stub user. display_name = email prefix; настраивается
		// в onboarding wizard (Phase M9.5 mobile).
		user = &domain.User{
			Email:        email,
			PasswordHash: "", // passwordless
			DisplayName:  defaultDisplayName(email),
			Locale:       "ru-RU",
			Timezone:     "Europe/Moscow",
		}
		if err := s.users.Create(ctx, user); err != nil {
			return nil, nil, false, fmt.Errorf("create user: %w", err)
		}
		isNew = true
	}

	pair, err := s.auth.issuePair(ctx, user.ID, userAgent)
	if err != nil {
		return nil, nil, false, err
	}
	return user, pair, isNew, nil
}

func isAllDigits(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
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
