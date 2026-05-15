// middleware.go — http.Handler middleware.
//
// Алгоритм (per D-05 / D-07 / D-08-revised + RESEARCH.md Pattern 2):
//   1. Если r.URL.Path входит в Policy.SkipPaths (exact prefix) → next.
//   2. r.Header.Get("X-Client-Version") пуст → slog.Warn + next (graceful).
//   3. Parse(header) → err → slog.Warn + next (graceful по D-08; v1.0 lenience).
//   4. semver.Compare(parsed, MinSupported) < 0 → 426 + JSON body. NOT next.
//   5. Иначе → attach (semver, build) в r.Context() и → next.
//
// 426 body совпадает с api/_shared/responses.yaml#/components/responses/UpgradeRequired
// (Plan 01-01 owns YAML).

package clientversion

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"golang.org/x/mod/semver"
)

// Middleware — внешний wrap для outermost http.Handler сервиса.
// Передавайте *slog.Logger сервиса; nil → slog.Default().
func Middleware(next http.Handler, p Policy, log *slog.Logger) http.Handler {
	log = loggerOrDefault(log)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 1. Skip-paths bypass.
		if matchesSkipPath(r.URL.Path, p.SkipPaths) {
			next.ServeHTTP(w, r)
			return
		}

		header := r.Header.Get("X-Client-Version")

		// 2. Missing header → graceful pass-through.
		if strings.TrimSpace(header) == "" {
			log.WarnContext(r.Context(),
				"clientversion: missing header",
				"path", r.URL.Path,
			)
			next.ServeHTTP(w, r)
			return
		}

		// 3. Parse — malformed → graceful pass-through (D-08 lenience).
		parsedSemver, build, err := Parse(header)
		if err != nil {
			log.WarnContext(r.Context(),
				"clientversion: malformed header",
				"value", header,
				"err", err.Error(),
				"path", r.URL.Path,
			)
			next.ServeHTTP(w, r)
			return
		}

		// 4. Compare against MinSupported.
		if compareSemver(parsedSemver, p.MinSupported) < 0 {
			writeUpgradeRequired(w, p, parsedSemver, build, log)
			return
		}

		// 5. Attach to context — handlers могут использовать для structured logging.
		ctx := context.WithValue(r.Context(), ctxKey{}, parsedVersion{
			semver: parsedSemver,
			build:  build,
		})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// matchesSkipPath — exact prefix match (HasPrefix). Для `/healthz` это покрывает
// `/healthz` и `/healthz/whatever`; в practical terms сервисы регистрируют
// `/healthz` без trailing-slash, поэтому prefix-match безопасен и совпадает с
// поведением stdlib http.ServeMux.
func matchesSkipPath(path string, skips []string) bool {
	for _, s := range skips {
		if s == "" {
			continue
		}
		if path == s || strings.HasPrefix(path, s+"/") {
			return true
		}
	}
	return false
}

// compareSemver — обёртка над golang.org/x/mod/semver.Compare, которая
// требует "v"-префикс. Если MinSupported не сконфигурирована (empty), возвращаем
// 0 (не блокируем — graceful default).
func compareSemver(a, b string) int {
	if a == "" || b == "" {
		return 0
	}
	return semver.Compare("v"+a, "v"+b)
}

// writeUpgradeRequired — HTTP 426 + JSON-body.
func writeUpgradeRequired(
	w http.ResponseWriter,
	p Policy,
	clientSemver, clientBuild string,
	log *slog.Logger,
) {
	body := upgradeRequiredBody{
		Error:                 "client_too_old",
		MinVersion:            p.MinSupported,
		ForceUpdateURLAndroid: p.ForceUpdateURLAndroid,
		ForceUpdateURLiOS:     p.ForceUpdateURLiOS,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUpgradeRequired)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Warn("clientversion: encode 426 body",
			"err", err.Error(),
			"client_semver", clientSemver,
			"client_build", clientBuild,
		)
	}
}
