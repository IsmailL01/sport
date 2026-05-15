// Package clientversion — HTTP middleware для проверки заголовка X-Client-Version.
// Phase 1 / REL-02 (см. .planning/phases/01-release-contract-and-version-baseline/).
//
// Контракт (D-05 / D-07 / D-08-revised):
//   - Mobile стампит заголовок `X-Client-Version: <semver> (<build>)` на каждый
//     outbound HTTP request (apps/mobile-rn/src/auth/apiClient.ts).
//   - Server middleware mounted на outermost wrap каждого сервиса (перед auth!).
//   - too-old → HTTP 426 Upgrade Required с JSON-body, совпадающим с
//     api/_shared/responses.yaml#/components/responses/UpgradeRequired.
//   - missing / malformed заголовок → graceful pass-through + slog.Warn
//     (D-08 revised; v1.0 lenience, v1.1 может ужесточить).
//
// Pattern parallel'ит pkg/ratelimit и pkg/permissions:
//   - subpackage внутри github.com/runningecosystem/backend/pkg (без отдельного go.mod);
//   - shared library, mounted каждым сервисом из cmd/server/main.go;
//   - graceful-degrade by default — не валим production-трафик из-за infra-сбоя.
//
// Caddy reverse-proxy passthrough: проверено в services/backend/scripts/test_clientversion_caddy.sh.
package clientversion

import (
	"context"
	"log/slog"
)

// Policy — runtime-конфиг middleware. Каждый сервис собирает Policy в main.go
// из ENV-переменных и передаёт в Middleware().
type Policy struct {
	// MinSupported — минимально поддерживаемая semver-версия клиента (без "v" префикса).
	// Пример: "1.0.0". Клиенты с semver < MinSupported получат 426.
	MinSupported string

	// ForceUpdateURLAndroid — куда отправить Android-клиента на обновление
	// (self-hosted manifest endpoint per Phase 18 AND-DIST / D-22).
	ForceUpdateURLAndroid string

	// ForceUpdateURLiOS — куда отправить iOS-клиента (App Store / TestFlight URL).
	ForceUpdateURLiOS string

	// SkipPaths — exact prefix-match list путей, которые middleware пропускает
	// без проверки (например `/healthz`, `/metrics`). Liveness / monitoring
	// должны работать независимо от версии клиента.
	SkipPaths []string
}

// upgradeRequiredBody — JSON, совпадает с
// api/_shared/responses.yaml#/components/responses/UpgradeRequired
// (Plan 01-01 owns YAML; ключи должны быть синхронны).
type upgradeRequiredBody struct {
	Error                 string `json:"error"`
	MinVersion            string `json:"min_version"`
	ForceUpdateURLAndroid string `json:"force_update_url_android"`
	ForceUpdateURLiOS     string `json:"force_update_url_ios"`
}

// ctxKey — приватный тип для context-key, чтобы избежать коллизий.
type ctxKey struct{}

// parsedVersion — приватный struct, кладётся в context для downstream-handlers.
type parsedVersion struct {
	semver string
	build  string
}

// FromContext возвращает parsed X-Client-Version, attached middleware'ом.
// ok=false если запрос пришёл без header'а / с malformed header'ом
// (graceful-pass) или если context не прошёл через Middleware.
//
// Использование: для structured logging внутри handler'ов.
//
//	semver, build, ok := clientversion.FromContext(r.Context())
//	if ok {
//	    logger.Info("request", "client_semver", semver, "client_build", build)
//	}
func FromContext(ctx context.Context) (semver string, build string, ok bool) {
	if ctx == nil {
		return "", "", false
	}
	v, found := ctx.Value(ctxKey{}).(parsedVersion)
	if !found {
		return "", "", false
	}
	return v.semver, v.build, true
}

// loggerOrDefault — безопасный fallback на slog.Default(), если в Policy
// логгер не передан. Тесты используют namespace'd buffer; production-сервисы
// передают сконфигурированный JSONHandler.
func loggerOrDefault(l *slog.Logger) *slog.Logger {
	if l == nil {
		return slog.Default()
	}
	return l
}
