package auth

import (
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func newTestSigner(t *testing.T) *Signer {
	t.Helper()
	s, err := NewSigner([]byte("test-secret-must-be-at-least-32-bytes-long-for-hs256"))
	if err != nil {
		t.Fatalf("NewSigner: %v", err)
	}
	return s
}

func TestNewSigner_RejectsShortSecret(t *testing.T) {
	if _, err := NewSigner([]byte("short")); err == nil {
		t.Fatal("expected error for short secret")
	}
}

func TestIssueAndVerifyAccess(t *testing.T) {
	s := newTestSigner(t)

	tok, err := s.IssueAccess("user-123")
	if err != nil {
		t.Fatalf("IssueAccess: %v", err)
	}
	if tok == "" || strings.Count(tok, ".") != 2 {
		t.Fatalf("not a JWT: %q", tok)
	}

	claims, err := s.VerifyAccess(tok)
	if err != nil {
		t.Fatalf("VerifyAccess: %v", err)
	}
	if claims.UserID != "user-123" {
		t.Errorf("uid mismatch: got %q", claims.UserID)
	}
	if claims.Type != "access" {
		t.Errorf("type mismatch: got %q", claims.Type)
	}
	if claims.Issuer != Issuer {
		t.Errorf("issuer mismatch: got %q", claims.Issuer)
	}
}

func TestVerifyRefresh_RejectsAccessToken(t *testing.T) {
	s := newTestSigner(t)
	tok, _ := s.IssueAccess("u1")
	if _, err := s.VerifyRefresh(tok); err == nil {
		t.Fatal("expected type-mismatch error when verifying access token as refresh")
	}
}

func TestVerifyAccess_RejectsRefreshToken(t *testing.T) {
	s := newTestSigner(t)
	tok, _ := s.IssueRefresh("u1")
	if _, err := s.VerifyAccess(tok); err == nil {
		t.Fatal("expected type-mismatch error when verifying refresh token as access")
	}
}

func TestVerify_RejectsExpired(t *testing.T) {
	s := newTestSigner(t)

	// Создаём токен с уже истекшим exp руками, чтобы не ждать 15 минут.
	now := time.Now().Add(-time.Hour)
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    Issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Minute)),
		},
		UserID: "u1",
		Type:   "access",
	}
	tok, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)

	if _, err := s.VerifyAccess(tok); err == nil {
		t.Fatal("expected expired-token error")
	}
}

func TestVerify_RejectsWrongSecret(t *testing.T) {
	s1 := newTestSigner(t)
	s2, _ := NewSigner([]byte("different-secret-also-32-bytes-long-aaa"))

	tok, _ := s1.IssueAccess("u1")
	if _, err := s2.VerifyAccess(tok); err == nil {
		t.Fatal("expected signature-verification error")
	}
}
