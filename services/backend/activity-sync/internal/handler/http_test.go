package handler_test

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/runningecosystem/backend/activity-sync/internal/handler"
	"github.com/runningecosystem/backend/activity-sync/internal/repository/memory"
	"github.com/runningecosystem/backend/activity-sync/internal/service"
	"github.com/runningecosystem/backend/pkg/auth"
)

func newTestServer(t *testing.T) (*httptest.Server, *auth.Signer) {
	t.Helper()
	signer, _ := auth.NewSigner([]byte("test-secret-must-be-at-least-32-bytes-long-for-hs256"))
	svc := service.NewSyncService(memory.NewSessionRepo(), memory.NewPointRepo())
	h := handler.NewSyncHandler(svc, signer, slog.New(slog.NewTextHandler(io.Discard, nil)))
	srv := httptest.NewServer(h.Routes())
	t.Cleanup(srv.Close)
	return srv, signer
}

func tokenFor(t *testing.T, signer *auth.Signer, userID string) string {
	t.Helper()
	tok, err := signer.IssueAccess(userID)
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func authedRequest(t *testing.T, method, url, token string, body any) *http.Response {
	t.Helper()
	var rdr io.Reader
	if body != nil {
		buf, _ := json.Marshal(body)
		rdr = bytes.NewReader(buf)
	}
	req, err := http.NewRequest(method, url, rdr)
	if err != nil {
		t.Fatal(err)
	}
	if rdr != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func TestUpsertSession_RequiresAuth(t *testing.T) {
	srv, _ := newTestServer(t)
	resp, _ := http.Post(srv.URL+"/sessions", "application/json", bytes.NewReader([]byte(`{}`)))
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestUpsertSession_HappyPath(t *testing.T) {
	srv, signer := newTestServer(t)
	tok := tokenFor(t, signer, "user-1")

	resp := authedRequest(t, http.MethodPost, srv.URL+"/sessions", tok, map[string]any{
		"clientSessionId": 1700000000000,
		"startedAt":       "2026-05-01T10:00:00Z",
	})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("status: %d, body: %s", resp.StatusCode, body)
	}
	var got struct {
		ID              string `json:"id"`
		ClientSessionID int64  `json:"clientSessionId"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&got)
	if got.ID == "" {
		t.Error("no id in response")
	}
	if got.ClientSessionID != 1700000000000 {
		t.Errorf("client session id: %d", got.ClientSessionID)
	}
}

func TestSession_CrossUserAccessDenied(t *testing.T) {
	srv, signer := newTestServer(t)
	tok1 := tokenFor(t, signer, "user-1")
	tok2 := tokenFor(t, signer, "user-2")

	// user-1 создаёт session
	r1 := authedRequest(t, http.MethodPost, srv.URL+"/sessions", tok1, map[string]any{
		"clientSessionId": 1, "startedAt": "2026-05-01T10:00:00Z",
	})
	var created struct{ ID string }
	_ = json.NewDecoder(r1.Body).Decode(&created)
	r1.Body.Close()

	// user-2 пытается читать
	r2 := authedRequest(t, http.MethodGet, srv.URL+"/sessions/"+created.ID, tok2, nil)
	defer r2.Body.Close()
	if r2.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 cross-user, got %d", r2.StatusCode)
	}
}

func TestPointsBatch_AppendAndList(t *testing.T) {
	srv, signer := newTestServer(t)
	tok := tokenFor(t, signer, "user-1")

	r1 := authedRequest(t, http.MethodPost, srv.URL+"/sessions", tok, map[string]any{
		"clientSessionId": 1, "startedAt": "2026-05-01T10:00:00Z",
	})
	var created struct{ ID string }
	_ = json.NewDecoder(r1.Body).Decode(&created)
	r1.Body.Close()

	r2 := authedRequest(t, http.MethodPost, srv.URL+"/sessions/"+created.ID+"/points", tok, map[string]any{
		"points": []map[string]any{
			{"timestamp": "2026-05-01T10:00:00Z", "latitude": 50.0, "longitude": 10.0},
			{"timestamp": "2026-05-01T10:00:01Z", "latitude": 50.0001, "longitude": 10.0001},
		},
	})
	defer r2.Body.Close()
	if r2.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(r2.Body)
		t.Fatalf("status: %d, body: %s", r2.StatusCode, body)
	}
	var ins struct{ Inserted int }
	_ = json.NewDecoder(r2.Body).Decode(&ins)
	if ins.Inserted != 2 {
		t.Errorf("inserted: %d", ins.Inserted)
	}

	// List
	r3 := authedRequest(t, http.MethodGet, srv.URL+"/sessions/"+created.ID+"/points", tok, nil)
	defer r3.Body.Close()
	var pts []map[string]any
	_ = json.NewDecoder(r3.Body).Decode(&pts)
	if len(pts) != 2 {
		t.Errorf("expected 2 points, got %d", len(pts))
	}
}

func TestUpsertSession_Idempotent(t *testing.T) {
	srv, signer := newTestServer(t)
	tok := tokenFor(t, signer, "user-1")

	body := map[string]any{
		"clientSessionId": 42, "startedAt": "2026-05-01T10:00:00Z",
	}
	r1 := authedRequest(t, http.MethodPost, srv.URL+"/sessions", tok, body)
	var s1 struct{ ID string }
	_ = json.NewDecoder(r1.Body).Decode(&s1)
	r1.Body.Close()

	r2 := authedRequest(t, http.MethodPost, srv.URL+"/sessions", tok, body)
	var s2 struct{ ID string }
	_ = json.NewDecoder(r2.Body).Decode(&s2)
	r2.Body.Close()

	if s1.ID != s2.ID {
		t.Errorf("upsert created new session id: %q vs %q", s2.ID, s1.ID)
	}
}

func TestDeleteSession(t *testing.T) {
	srv, signer := newTestServer(t)
	tok := tokenFor(t, signer, "user-1")

	r1 := authedRequest(t, http.MethodPost, srv.URL+"/sessions", tok, map[string]any{
		"clientSessionId": 1, "startedAt": "2026-05-01T10:00:00Z",
	})
	var created struct{ ID string }
	_ = json.NewDecoder(r1.Body).Decode(&created)
	r1.Body.Close()

	r2 := authedRequest(t, http.MethodDelete, srv.URL+"/sessions/"+created.ID, tok, nil)
	r2.Body.Close()
	if r2.StatusCode != http.StatusNoContent {
		t.Errorf("expected 204, got %d", r2.StatusCode)
	}

	// Повторный get → 404
	r3 := authedRequest(t, http.MethodGet, srv.URL+"/sessions/"+created.ID, tok, nil)
	r3.Body.Close()
	if r3.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404 after delete, got %d", r3.StatusCode)
	}
}
