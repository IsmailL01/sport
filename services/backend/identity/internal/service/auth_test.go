package service

import (
	"context"
	"errors"
	"testing"

	"github.com/runningecosystem/backend/identity/internal/domain"
	"github.com/runningecosystem/backend/identity/internal/repository/memory"
	"github.com/runningecosystem/backend/pkg/auth"
)

func newTestService(t *testing.T) *AuthService {
	t.Helper()
	signer, err := auth.NewSigner([]byte("test-secret-must-be-at-least-32-bytes-long-for-hs256"))
	if err != nil {
		t.Fatal(err)
	}
	s := NewAuthService(memory.NewUserRepo(), memory.NewRefreshTokenRepo(), signer)
	// Снижаем cost bcrypt'а чтобы тесты не были медленными.
	s.bcryptC = 4
	return s
}

func TestRegister_HappyPath(t *testing.T) {
	s := newTestService(t)
	u, pair, err := s.Register(context.Background(), "  Alice@Example.COM  ", "password123", "Alice", "test")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if u.Email != "alice@example.com" {
		t.Errorf("email not normalized: %q", u.Email)
	}
	if u.PasswordHash == "password123" {
		t.Error("password stored in plain")
	}
	if pair.AccessToken == "" || pair.RefreshToken == "" {
		t.Error("token pair not issued")
	}
}

func TestRegister_DuplicateEmail(t *testing.T) {
	s := newTestService(t)
	ctx := context.Background()
	if _, _, err := s.Register(ctx, "a@b.com", "password123", "", ""); err != nil {
		t.Fatal(err)
	}
	_, _, err := s.Register(ctx, "a@b.com", "password456", "", "")
	if !errors.Is(err, domain.ErrEmailAlreadyExists) {
		t.Errorf("expected ErrEmailAlreadyExists, got %v", err)
	}
}

func TestRegister_RejectsInvalidEmail(t *testing.T) {
	s := newTestService(t)
	for _, e := range []string{"", "not-an-email", "@b.com", "a@"} {
		if _, _, err := s.Register(context.Background(), e, "password123", "", ""); err == nil {
			t.Errorf("expected error for email %q", e)
		}
	}
}

func TestRegister_RejectsShortPassword(t *testing.T) {
	s := newTestService(t)
	if _, _, err := s.Register(context.Background(), "a@b.com", "short", "", ""); err == nil {
		t.Error("expected password too short")
	}
}

func TestLogin_HappyPath(t *testing.T) {
	s := newTestService(t)
	ctx := context.Background()
	if _, _, err := s.Register(ctx, "a@b.com", "password123", "", ""); err != nil {
		t.Fatal(err)
	}
	u, pair, err := s.Login(ctx, "a@b.com", "password123", "")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if u.Email != "a@b.com" {
		t.Errorf("email mismatch: %q", u.Email)
	}
	if pair.AccessToken == "" {
		t.Error("no access token")
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	s := newTestService(t)
	ctx := context.Background()
	_, _, _ = s.Register(ctx, "a@b.com", "password123", "", "")
	_, _, err := s.Login(ctx, "a@b.com", "wrong-password", "")
	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials, got %v", err)
	}
}

func TestLogin_UnknownUser_ReturnsInvalidCredentials(t *testing.T) {
	s := newTestService(t)
	_, _, err := s.Login(context.Background(), "nobody@b.com", "password123", "")
	// Защита от user enumeration: возвращаем то же что и при неверном пароле.
	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials, got %v", err)
	}
}

func TestRefresh_RotatesTokens(t *testing.T) {
	s := newTestService(t)
	ctx := context.Background()
	_, pair1, err := s.Register(ctx, "a@b.com", "password123", "", "")
	if err != nil {
		t.Fatal(err)
	}
	pair2, err := s.Refresh(ctx, pair1.RefreshToken, "")
	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if pair2.RefreshToken == pair1.RefreshToken {
		t.Error("refresh token not rotated")
	}
	// Старый refresh — revoked, не должен работать.
	if _, err := s.Refresh(ctx, pair1.RefreshToken, ""); !errors.Is(err, domain.ErrTokenRevoked) {
		t.Errorf("expected ErrTokenRevoked for old refresh, got %v", err)
	}
}

func TestLogout_IsIdempotent(t *testing.T) {
	s := newTestService(t)
	ctx := context.Background()
	_, pair, _ := s.Register(ctx, "a@b.com", "password123", "", "")
	if err := s.Logout(ctx, pair.RefreshToken); err != nil {
		t.Fatalf("Logout: %v", err)
	}
	// Повторный logout того же токена не должен падать.
	if err := s.Logout(ctx, pair.RefreshToken); err != nil {
		t.Fatalf("Logout (2nd): %v", err)
	}
}

func TestLogout_TokenStopWorking(t *testing.T) {
	s := newTestService(t)
	ctx := context.Background()
	_, pair, _ := s.Register(ctx, "a@b.com", "password123", "", "")
	_ = s.Logout(ctx, pair.RefreshToken)
	if _, err := s.Refresh(ctx, pair.RefreshToken, ""); err == nil {
		t.Error("refresh should fail after logout")
	}
}

func TestMe(t *testing.T) {
	s := newTestService(t)
	ctx := context.Background()
	u, _, _ := s.Register(ctx, "a@b.com", "password123", "Alice", "")
	got, err := s.Me(ctx, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.DisplayName != "Alice" {
		t.Errorf("display name: %q", got.DisplayName)
	}
}
