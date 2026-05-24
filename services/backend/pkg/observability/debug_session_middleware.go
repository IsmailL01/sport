// debug_session_middleware.go — Phase 5 / Plan 05-06 / OBS-08 / D-22 / D-23.
//
// DebugSessionMiddleware elevates per-request slog level к slog.LevelDebug
// только когда ВСЕ ТРИ gate'a совпадают (RESEARCH §1.8 three-gate threat
// model — header-only is debug-DoS vector):
//
//  1. HTTP header `X-Debug-Session: 1` присутствует в request
//  2. Bearer JWT в Authorization header valid AND claims.IsTester == true
//  3. featureflag `tester_debug_logging` ON для этого userID
//
// Все три → ctx carries slog.LevelDebug (через observability.WithLogLevel);
// downstream slog handler (см. slog_handler.go Enabled()) пропускает
// debug-level records для этого request.
//
// Любой gate fails → silent pass-through на дефолтном LevelInfo. Никаких
// slog emissions ни на каком branch — pre-auth attacker spamming the header
// должен не генерировать warn-floor log noise (RESEARCH §1.8). Эта тишина
// — обязательная characteristic; test'ы в debug_session_middleware_test.go
// + grep self-check в Task 1 <done> enforced this.
//
// Chain placement (D-32): OUTERMOST observability layer per-service main.go,
// wraps Plan 05-05's 4-layer chain (Promhttp → SentryRecovery → OtelHTTP →
// clientversion → routes). Because per-route auth (identity's requireAuth)
// validates JWT INSIDE the routes, DebugSessionMiddleware does its OWN JWT
// extraction directly from the Bearer header — это позволяет middleware
// функционировать как самодостаточный seam без зависимости от porder-of-
// middleware constraints. Defense-in-depth: per-route auth остаётся
// authoritative для actual access control; debug session — read-only side
// channel.
package observability

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"github.com/runningecosystem/backend/pkg/auth"
)

// FeatureFlagChecker — narrow interface для tester_debug_logging gate.
// Реальные production реализации (featureflags.Store) предоставят
// IsTesterDebugEnabled через адаптер; tests могут предоставить stub без
// тяжёлых Postgres зависимостей.
//
// Why a dedicated method (not raw IsEnabled): production Store.IsEnabled
// takes int64 userID (Phase 1 REL-03 schema), но Claims.UserID — UUID
// string. Adapter в main.go конвертирует UUID → int64 via FNV-1a hash
// (deterministic per-user bucket для rollout%); middleware остаётся
// agnostic к этой mapping detail.
type FeatureFlagChecker interface {
	// IsTesterDebugEnabled возвращает true если feature flag
	// `tester_debug_logging` ON для данного UUID userID. Default semantic:
	// fail-closed — любой err / no-store / not-registered → false.
	IsTesterDebugEnabled(ctx context.Context, userUUID string) bool
}

// DebugSessionMiddleware returns http middleware enforcing D-22 three-gate
// rule. Signer is used to validate the Bearer JWT in-place (avoids
// dependency on a separate auth-middleware layer).
//
// Per RESEARCH §1.8: silent pass-through on every failed gate. NO slog
// emission — gate failures must not amplify log volume.
//
// Usage in main.go (D-32):
//
//	rootHandler := observability.DebugSessionMiddleware(signer, ffAdapter)(
//	  observability.PromhttpMiddleware(serviceName,
//	    observability.SentryRecoveryMiddleware(
//	      observability.OtelHTTPMiddleware(serviceName, versionedMux))))
func DebugSessionMiddleware(signer *auth.Signer, ff FeatureFlagChecker) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Gate 1 — header check. Missing → passthrough.
			if r.Header.Get("X-Debug-Session") != "1" {
				next.ServeHTTP(w, r)
				return
			}

			// Gate 2 — JWT extraction + IsTester check. Pre-auth path (no
			// Bearer), malformed token, или IsTester=false → passthrough.
			// Defense-in-depth: token validation here is INDEPENDENT of per-
			// route requireAuth — keeps middleware self-contained.
			claims, ok := extractTesterClaims(r, signer)
			if !ok || !claims.IsTester {
				next.ServeHTTP(w, r)
				return
			}

			// Gate 3 — featureflag check. Fail-closed default (ff returns
			// false for unknown user / no store / query error).
			if ff == nil || !ff.IsTesterDebugEnabled(r.Context(), claims.UserID) {
				next.ServeHTTP(w, r)
				return
			}

			// All three gates pass → elevate to LevelDebug for this request only.
			ctx := WithLogLevel(r.Context(), slog.LevelDebug)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// extractTesterClaims читает Bearer token из Authorization header, верифицирует
// его signer'ом, возвращает claims. Используется DebugSessionMiddleware для
// in-place JWT validation независимо от per-route requireAuth.
//
// Returns (nil, false) на любую ошибку — pre-auth path, malformed token,
// expired token, wrong signature, refresh token (not access). NO logging.
func extractTesterClaims(r *http.Request, signer *auth.Signer) (*auth.Claims, bool) {
	if signer == nil {
		return nil, false
	}
	authHeader := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if !strings.HasPrefix(authHeader, prefix) {
		return nil, false
	}
	token := strings.TrimPrefix(authHeader, prefix)
	if token == "" {
		return nil, false
	}
	claims, err := signer.VerifyAccess(token)
	if err != nil {
		return nil, false
	}
	return claims, true
}
