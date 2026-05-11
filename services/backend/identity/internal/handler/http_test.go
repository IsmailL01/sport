package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/runningecosystem/backend/identity/internal/handler"
	"github.com/runningecosystem/backend/identity/internal/repository/memory"
	"github.com/runningecosystem/backend/identity/internal/service"
	"github.com/runningecosystem/backend/pkg/auth"
)

func newTestServer(t *testing.T) (*httptest.Server, *service.AuthService) {
	t.Helper()
	signer, _ := auth.NewSigner([]byte("test-secret-must-be-at-least-32-bytes-long-for-hs256"))
	svc := service.NewAuthService(memory.NewUserRepo(), memory.NewRefreshTokenRepo(), signer)
	// OTP tests live in postgres-backed integration suite; pass nil here —
	// existing handler_test cases не hits /auth/request-code или login-with-code.
	h := handler.NewAuthHandler(svc, nil, signer, slog.New(slog.NewTextHandler(io.Discard, nil)), false)
	srv := httptest.NewServer(h.Routes())
	t.Cleanup(srv.Close)
	return srv, svc
}

func postJSON(t *testing.T, url string, body any) *http.Response {
	t.Helper()
	buf, _ := json.Marshal(body)
	resp, err := http.Post(url, "application/json", bytes.NewReader(buf))
	if err != nil {
		t.Fatalf("POST %s: %v", url, err)
	}
	return resp
}

func decode(t *testing.T, r *http.Response, dst any) {
	t.Helper()
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		t.Fatalf("decode: %v", err)
	}
}

func TestRegisterEndpoint(t *testing.T) {
	srv, _ := newTestServer(t)
	resp := postJSON(t, srv.URL+"/auth/register", map[string]string{
		"email": "alice@example.com", "password": "password123", "displayName": "Alice",
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("status: %d", resp.StatusCode)
	}
	var got map[string]any
	decode(t, resp, &got)
	if got["accessToken"] == "" {
		t.Error("no access token in response")
	}
	if u, ok := got["user"].(map[string]any); !ok || u["email"] != "alice@example.com" {
		t.Errorf("user not in response: %+v", got)
	}
}

func TestRegisterEndpoint_DuplicateEmailReturns409(t *testing.T) {
	srv, _ := newTestServer(t)
	for i := 0; i < 2; i++ {
		resp := postJSON(t, srv.URL+"/auth/register", map[string]string{
			"email": "dup@example.com", "password": "password123",
		})
		if i == 0 && resp.StatusCode != http.StatusCreated {
			t.Fatalf("first: %d", resp.StatusCode)
		}
		if i == 1 && resp.StatusCode != http.StatusConflict {
			t.Fatalf("second: expected 409, got %d", resp.StatusCode)
		}
		resp.Body.Close()
	}
}

func TestLoginEndpoint_WrongPasswordReturns401(t *testing.T) {
	srv, _ := newTestServer(t)
	postJSON(t, srv.URL+"/auth/register", map[string]string{
		"email": "a@b.com", "password": "password123",
	}).Body.Close()
	resp := postJSON(t, srv.URL+"/auth/login", map[string]string{
		"email": "a@b.com", "password": "wrong",
	})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestMeEndpoint_RequiresBearerToken(t *testing.T) {
	srv, _ := newTestServer(t)
	resp, err := http.Get(srv.URL + "/me")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401 without auth header, got %d", resp.StatusCode)
	}
}

func TestMeEndpoint_HappyPath(t *testing.T) {
	srv, _ := newTestServer(t)

	// Регистрируемся → получаем access token.
	resp := postJSON(t, srv.URL+"/auth/register", map[string]string{
		"email": "alice@example.com", "password": "password123", "displayName": "Alice",
	})
	var registered struct {
		AccessToken string `json:"accessToken"`
	}
	decode(t, resp, &registered)

	// Запрашиваем /me с Bearer.
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, srv.URL+"/me", nil)
	req.Header.Set("Authorization", "Bearer "+registered.AccessToken)
	r2, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer r2.Body.Close()
	if r2.StatusCode != http.StatusOK {
		t.Fatalf("status: %d", r2.StatusCode)
	}
	var me struct {
		Email       string `json:"email"`
		DisplayName string `json:"displayName"`
	}
	decode(t, r2, &me)
	if me.Email != "alice@example.com" || me.DisplayName != "Alice" {
		t.Errorf("unexpected /me: %+v", me)
	}
}

func TestRefreshEndpoint(t *testing.T) {
	srv, _ := newTestServer(t)
	r1 := postJSON(t, srv.URL+"/auth/register", map[string]string{
		"email": "a@b.com", "password": "password123",
	})
	var pair1 struct {
		RefreshToken string `json:"refreshToken"`
		AccessToken  string `json:"accessToken"`
	}
	decode(t, r1, &pair1)

	r2 := postJSON(t, srv.URL+"/auth/refresh", map[string]string{
		"refreshToken": pair1.RefreshToken,
	})
	defer r2.Body.Close()
	if r2.StatusCode != http.StatusOK {
		t.Fatalf("refresh status: %d", r2.StatusCode)
	}
	var pair2 struct {
		RefreshToken string `json:"refreshToken"`
	}
	decode(t, r2, &pair2)
	if pair2.RefreshToken == pair1.RefreshToken {
		t.Error("refresh token not rotated")
	}
}

func TestHealthz(t *testing.T) {
	srv, _ := newTestServer(t)
	resp, err := http.Get(srv.URL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status: %d", resp.StatusCode)
	}
}
