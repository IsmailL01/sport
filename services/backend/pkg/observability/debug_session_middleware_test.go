// debug_session_middleware_test.go — Phase 5 / Plan 05-06 / OBS-08 / D-22 / D-23.
//
// Тесты для D-22 three-gate rule:
//  1. X-Debug-Session: 1 header
//  2. JWT claim IsTester = true (extracted via auth.Signer)
//  3. featureflag tester_debug_logging = ON for that user
//
// Все три → ctx carries slog.LevelDebug; иначе LevelInfo (default).
//
// RESEARCH §1.8: header-only is a debug-DoS vector. Middleware MUST be silent
// pass-through on every failed gate (NO slog emission), чтобы pre-auth attacker
// spamming the header не генерировал warn-floor log noise.
package observability_test

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/runningecosystem/backend/pkg/auth"
	"github.com/runningecosystem/backend/pkg/observability"
)

// stubFFStore — implements observability.FeatureFlagChecker (test interface).
// Returns the configured enabled value regardless of (userID, flag) — keeps
// tests focused on three-gate logic, not featureflag store semantics.
type stubFFStore struct {
	enabled bool
	calls   atomic.Int32
}

func (s *stubFFStore) IsTesterDebugEnabled(_ context.Context, _ string) bool {
	s.calls.Add(1)
	return s.enabled
}

// runDebugRequest — test helper. Constructs a request with optional header +
// optional valid JWT (IsTester per arg), runs through DebugSessionMiddleware,
// returns the slog.Level the next handler observed via LogLevelFromContext.
func runDebugRequest(
	t *testing.T,
	headerSet bool,
	jwtIssued bool,
	jwtIsTester bool,
	ffEnabled bool,
) (observedLevel slog.Level, levelOverridden bool, nextCalled bool, ffCalls int32) {
	t.Helper()

	// Test signer (256-bit secret).
	secret := []byte("test-secret-32-bytes-long-enough-x")
	signer, err := auth.NewSigner(secret)
	if err != nil {
		t.Fatalf("NewSigner: %v", err)
	}

	ff := &stubFFStore{enabled: ffEnabled}

	// Capture the level observed inside next.
	var capturedLevel = slog.LevelInfo
	var capturedOverride bool
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		if lvl, ok := observability.LogLevelFromContext(r.Context()); ok {
			capturedLevel = lvl
			capturedOverride = true
		}
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "ok")
	})

	mw := observability.DebugSessionMiddleware(signer, ff)
	h := mw(next)

	req := httptest.NewRequest(http.MethodGet, "/any", nil)
	if headerSet {
		req.Header.Set("X-Debug-Session", "1")
	}
	if jwtIssued {
		// IssueTesterAccess used only in tests — issues a regular access
		// token with IsTester=true. Production path uses IssueAccess (which
		// always emits IsTester=false until users.is_tester column ships).
		tok, err := signer.IssueTesterAccess("user-uuid-fixture", jwtIsTester)
		if err != nil {
			t.Fatalf("IssueTesterAccess: %v", err)
		}
		req.Header.Set("Authorization", "Bearer "+tok)
	}

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	return capturedLevel, capturedOverride, called, ff.calls.Load()
}

// Test 1 — TestDebugSessionMiddleware_AllThreeTrue:
// header + JWT is_tester=true + featureflag ON → ctx carries LevelDebug.
func TestDebugSessionMiddleware_AllThreeTrue(t *testing.T) {
	t.Parallel()
	lvl, overridden, called, ffCalls := runDebugRequest(t,
		true, // headerSet
		true, // jwtIssued
		true, // jwtIsTester
		true, // ffEnabled
	)
	if !called {
		t.Fatal("next.ServeHTTP not called")
	}
	if !overridden {
		t.Fatal("expected ctx to carry LogLevel override; got none")
	}
	if lvl != slog.LevelDebug {
		t.Fatalf("LogLevel = %v, want %v", lvl, slog.LevelDebug)
	}
	if ffCalls != 1 {
		t.Fatalf("ff.IsTesterDebugEnabled calls = %d, want 1", ffCalls)
	}
}

// Test 2 sub-A — no_header: header absent → LevelInfo (default).
func TestDebugSessionMiddleware_DefaultsToInfo_NoHeader(t *testing.T) {
	t.Parallel()
	lvl, overridden, called, ffCalls := runDebugRequest(t,
		false, // headerSet
		true,  // jwtIssued
		true,  // jwtIsTester
		true,  // ffEnabled
	)
	if !called {
		t.Fatal("next.ServeHTTP not called")
	}
	if overridden {
		t.Fatalf("expected no LogLevel override; got %v", lvl)
	}
	if ffCalls != 0 {
		t.Fatalf("ff should not be consulted when header missing; got %d calls", ffCalls)
	}
}

// Test 2 sub-B — no_jwt_claim: header set, JWT issued but IsTester=false → LevelInfo.
func TestDebugSessionMiddleware_DefaultsToInfo_NoJWTClaim(t *testing.T) {
	t.Parallel()
	lvl, overridden, called, ffCalls := runDebugRequest(t,
		true,  // headerSet
		true,  // jwtIssued
		false, // jwtIsTester = false ← gate fails here
		true,  // ffEnabled
	)
	if !called {
		t.Fatal("next.ServeHTTP not called")
	}
	if overridden {
		t.Fatalf("expected no LogLevel override; got %v", lvl)
	}
	if ffCalls != 0 {
		t.Fatalf("ff should not be consulted when IsTester=false; got %d calls", ffCalls)
	}
}

// Test 2 sub-C — featureflag_off: header + JWT IsTester both set, ff=OFF → LevelInfo.
func TestDebugSessionMiddleware_DefaultsToInfo_FeatureflagOff(t *testing.T) {
	t.Parallel()
	lvl, overridden, called, ffCalls := runDebugRequest(t,
		true,  // headerSet
		true,  // jwtIssued
		true,  // jwtIsTester
		false, // ffEnabled = false ← gate fails here
	)
	if !called {
		t.Fatal("next.ServeHTTP not called")
	}
	if overridden {
		t.Fatalf("expected no LogLevel override; got %v", lvl)
	}
	if ffCalls != 1 {
		// ff IS consulted (we got past gates 1 and 2); it returned false.
		t.Fatalf("ff.IsTesterDebugEnabled calls = %d, want 1", ffCalls)
	}
}

// Test 3 — TestDebugSessionMiddleware_PreAuthPath:
// header set, NO JWT in request (pre-auth path like /healthz, /metrics,
// /auth/request-code) → MUST NOT elevate. RESEARCH §1.8 — proves "no JWT =
// no elevation, even if header set" guarantee.
func TestDebugSessionMiddleware_PreAuthPath(t *testing.T) {
	t.Parallel()
	lvl, overridden, called, ffCalls := runDebugRequest(t,
		true,  // headerSet
		false, // jwtIssued = false (pre-auth path)
		false, // jwtIsTester (irrelevant)
		true,  // ffEnabled (irrelevant)
	)
	if !called {
		t.Fatal("next.ServeHTTP not called (middleware must always passthrough)")
	}
	if overridden {
		t.Fatalf("expected NO LogLevel override on pre-auth path; got %v", lvl)
	}
	if ffCalls != 0 {
		t.Fatalf("ff must not be consulted on pre-auth path; got %d calls", ffCalls)
	}
}

// Test 4 — invalid/malformed JWT in header → MUST NOT elevate.
// Defense-in-depth: a forged Bearer token from anonymous attacker fails
// signature verification and gets treated as pre-auth path. RESEARCH §1.8.
func TestDebugSessionMiddleware_InvalidJWT(t *testing.T) {
	t.Parallel()

	secret := []byte("test-secret-32-bytes-long-enough-x")
	signer, err := auth.NewSigner(secret)
	if err != nil {
		t.Fatalf("NewSigner: %v", err)
	}
	ff := &stubFFStore{enabled: true}

	var capturedLevel = slog.LevelInfo
	var capturedOverride bool
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if lvl, ok := observability.LogLevelFromContext(r.Context()); ok {
			capturedLevel = lvl
			capturedOverride = true
		}
		w.WriteHeader(http.StatusOK)
	})

	mw := observability.DebugSessionMiddleware(signer, ff)
	h := mw(next)

	req := httptest.NewRequest(http.MethodGet, "/any", nil)
	req.Header.Set("X-Debug-Session", "1")
	req.Header.Set("Authorization", "Bearer not.a.valid.jwt.token")

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (passthrough)", rec.Code)
	}
	if capturedOverride {
		t.Fatalf("expected no LogLevel override on invalid JWT; got %v", capturedLevel)
	}
	if ff.calls.Load() != 0 {
		t.Fatalf("ff must not be consulted on invalid JWT; got %d calls", ff.calls.Load())
	}
}

// Test 5 — TestDebugSessionMiddleware_Silent:
// Middleware MUST NOT emit any slog calls on any branch. We can't directly
// assert "no slog calls" without redirecting slog.Default — instead we grep
// the file at build time. This test is a sentinel that runs alongside; the
// grep self-check in <done> block of Task 1 is the authoritative assertion.
//
// Here we verify the middleware doesn't write anything to ResponseWriter
// either (passthrough is total — body untouched, status untouched).
func TestDebugSessionMiddleware_SilentPassthrough(t *testing.T) {
	t.Parallel()

	secret := []byte("test-secret-32-bytes-long-enough-x")
	signer, _ := auth.NewSigner(secret)
	ff := &stubFFStore{enabled: false}

	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTeapot) // 418 — distinctive
		_, _ = io.WriteString(w, "next-was-here")
	})

	mw := observability.DebugSessionMiddleware(signer, ff)
	h := mw(next)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusTeapot {
		t.Fatalf("status = %d, want 418 (next-handler authoritative)", rec.Code)
	}
	if rec.Body.String() != "next-was-here" {
		t.Fatalf("body = %q, want %q", rec.Body.String(), "next-was-here")
	}
}
