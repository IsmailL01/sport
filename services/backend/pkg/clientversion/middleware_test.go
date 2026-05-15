package clientversion

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func newTestPolicy() Policy {
	return Policy{
		MinSupported:          "1.0.0",
		ForceUpdateURLAndroid: "https://example.com/android/manifest.json",
		ForceUpdateURLiOS:     "https://apps.apple.com/app/example",
		SkipPaths:             []string{"/healthz", "/metrics"},
	}
}

// stubNext — handler-spy: считает кол-во вызовов, отвечает 200 OK.
type stubNext struct {
	calls atomic.Int32
}

func (s *stubNext) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.calls.Add(1)
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, "ok")
}

func newLogger() (*slog.Logger, *bytes.Buffer) {
	buf := &bytes.Buffer{}
	return slog.New(slog.NewTextHandler(buf, &slog.HandlerOptions{Level: slog.LevelDebug})), buf
}

func runRequest(
	t *testing.T,
	policy Policy,
	headerValue string,
	path string,
) (rec *httptest.ResponseRecorder, nextCalls int32, logBuf *bytes.Buffer) {
	t.Helper()
	logger, buf := newLogger()
	next := &stubNext{}
	h := Middleware(next, policy, logger)

	req := httptest.NewRequest(http.MethodGet, path, nil)
	if headerValue != "<unset>" {
		req.Header.Set("X-Client-Version", headerValue)
	}
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec, next.calls.Load(), buf
}

// Test 7: missing header → next handler called, response 200 (graceful pass-through).
func TestMiddleware_MissingHeader_GracefulPass(t *testing.T) {
	t.Parallel()
	rec, calls, logBuf := runRequest(t, newTestPolicy(), "<unset>", "/api/foo")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if calls != 1 {
		t.Fatalf("next.calls = %d, want 1", calls)
	}
	if !strings.Contains(logBuf.String(), "clientversion") {
		t.Errorf("expected warn log scoped 'clientversion'; got: %s", logBuf.String())
	}
}

// Test 8: malformed header → next handler called, response 200 + slog.Warn captured.
func TestMiddleware_MalformedHeader_GracefulPass(t *testing.T) {
	t.Parallel()
	rec, calls, logBuf := runRequest(t, newTestPolicy(), "garbage-not-semver", "/api/foo")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if calls != 1 {
		t.Fatalf("next.calls = %d, want 1", calls)
	}
	if !strings.Contains(logBuf.String(), "clientversion") || !strings.Contains(logBuf.String(), "malformed") {
		t.Errorf("expected 'clientversion: malformed' warn; got: %s", logBuf.String())
	}
}

// Test 9: valid header at MinSupported → pass (equal is allowed).
func TestMiddleware_AtMinVersion_Pass(t *testing.T) {
	t.Parallel()
	rec, calls, _ := runRequest(t, newTestPolicy(), "1.0.0", "/api/foo")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if calls != 1 {
		t.Fatalf("next.calls = %d, want 1", calls)
	}
}

// Test 10: client below min → 426 with structured body, no next call.
func TestMiddleware_BelowMinVersion_426(t *testing.T) {
	t.Parallel()
	rec, calls, _ := runRequest(t, newTestPolicy(), "0.9.9 (12)", "/api/foo")
	if rec.Code != http.StatusUpgradeRequired {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUpgradeRequired)
	}
	if calls != 0 {
		t.Fatalf("next.calls = %d, want 0 (must short-circuit)", calls)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", got)
	}
	var body struct {
		Error                 string `json:"error"`
		MinVersion            string `json:"min_version"`
		ForceUpdateURLAndroid string `json:"force_update_url_android"`
		ForceUpdateURLiOS     string `json:"force_update_url_ios"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Error != "client_too_old" {
		t.Errorf("error = %q, want client_too_old", body.Error)
	}
	if body.MinVersion != "1.0.0" {
		t.Errorf("min_version = %q, want 1.0.0", body.MinVersion)
	}
	if body.ForceUpdateURLAndroid == "" || body.ForceUpdateURLiOS == "" {
		t.Errorf("URLs must be present: %+v", body)
	}
}

// Test 11: skip-path bypasses check entirely.
func TestMiddleware_SkipPath_BypassesEvenForOldVersion(t *testing.T) {
	t.Parallel()
	rec, calls, _ := runRequest(t, newTestPolicy(), "0.0.1", "/healthz")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if calls != 1 {
		t.Fatalf("next.calls = %d, want 1 (skip-path must pass)", calls)
	}
}

// Test 12: semver comparison ignores build suffix.
func TestMiddleware_BuildSuffix_IgnoredForComparison(t *testing.T) {
	t.Parallel()
	rec, calls, _ := runRequest(t, newTestPolicy(), "1.0.0+build42", "/api/foo")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if calls != 1 {
		t.Fatalf("next.calls = %d, want 1", calls)
	}
}

// Bonus: FromContext returns parsed version when middleware accepted the request.
func TestMiddleware_FromContext_Populated(t *testing.T) {
	t.Parallel()
	logger, _ := newLogger()
	var gotSemver, gotBuild string
	var gotOK bool
	leaf := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotSemver, gotBuild, gotOK = FromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})
	h := Middleware(leaf, newTestPolicy(), logger)

	req := httptest.NewRequest(http.MethodGet, "/api/foo", nil)
	req.Header.Set("X-Client-Version", "1.2.3 (77)")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if !gotOK {
		t.Fatal("FromContext ok = false, want true")
	}
	if gotSemver != "1.2.3" {
		t.Errorf("semver = %q, want 1.2.3", gotSemver)
	}
	if gotBuild != "77" {
		t.Errorf("build = %q, want 77", gotBuild)
	}
}

// Bonus: nil logger falls back to slog.Default and doesn't panic.
func TestMiddleware_NilLogger_NoPanic(t *testing.T) {
	t.Parallel()
	next := &stubNext{}
	h := Middleware(next, newTestPolicy(), nil)
	req := httptest.NewRequest(http.MethodGet, "/api/foo", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req) // must not panic
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}
