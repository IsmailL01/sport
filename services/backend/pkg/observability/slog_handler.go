// slog_handler.go — JSON slog.Handler с PII-scrub + default attrs +
// per-request log-level override seam. Phase 5 / OBS-03 / OBS-04 / OBS-06
// / D-09 / D-10 / D-11.
//
// Конструкция (D-10):
//   - NewSlogJSONHandler(Config) → *slog.Logger; wraps slog.NewJSONHandler.
//   - Custom Handler intercepts each Attr через Handle:
//   - Drop entire attr если IsDenied(key) — minimum-information principle.
//   - Replace key with "email_hash" + value with HashEmail(value) если
//     ShouldHash(key).
//   - Иначе passthrough.
//   - Adds default attrs to каждой записи: service / env / version /
//     request_id (последний из ctx — empty string если не set).
//   - Per-request LogLevel override via context (D-11 + D-22 seam, used by
//     Plan 05-06 debug_session_middleware).
//
// Defense-in-depth (D-13): call-sites also use `if devMode { ... }` gating
// для OTP code; handler is the second wall.
package observability

import (
	"context"
	"log/slog"
	"os"
	"strings"
)

// Config — runtime-конфиг handler'a. Каждый service собирает Config в
// main.go из ENV (BUILD_VERSION inject'ится через -ldflags).
type Config struct {
	// ServiceName — e.g., "identity", "feed", "gateway". Hardcoded constant
	// per-service. Также используется как Sentry tag в Plan 05-05 (D-32).
	ServiceName string

	// Env — "prod" | "staging" | "dev". Source: env var ENV.
	Env string

	// Version — git SHA / build ID. Source: -ldflags "-X main.version=..."
	// или env var BUILD_VERSION. Empty string OK для dev (uses "dev" label).
	Version string

	// Level — minimum slog level. Per-request override via WithLogLevel(ctx, ...)
	// elevates Level for that request only (Plan 05-06 seam).
	Level slog.Level
}

// ctxKey — приватный namespace'd context-key type (избегает коллизий с
// другими пакетами). Same pattern as pkg/clientversion.
type ctxKey struct{ name string }

var (
	requestIDKey = ctxKey{"request_id"}
	logLevelKey  = ctxKey{"log_level"}
)

// WithRequestID attaches a request-id (UUID, span-id, и т.п.) к контексту.
// Used by middleware that wraps incoming HTTP requests.
func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey, id)
}

// RequestIDFromContext returns the attached request-id; ok=false если не set.
func RequestIDFromContext(ctx context.Context) (string, bool) {
	if ctx == nil {
		return "", false
	}
	v, ok := ctx.Value(requestIDKey).(string)
	return v, ok
}

// WithLogLevel returns a derived context that elevates slog level for downstream
// handlers. Used by Plan 05-06 DebugSessionMiddleware (X-Debug-Session header
// + JWT is_tester + featureflag → LevelDebug).
func WithLogLevel(ctx context.Context, lvl slog.Level) context.Context {
	return context.WithValue(ctx, logLevelKey, lvl)
}

// LogLevelFromContext returns the override level if set, ok=false otherwise.
func LogLevelFromContext(ctx context.Context) (slog.Level, bool) {
	if ctx == nil {
		return slog.LevelInfo, false
	}
	v, ok := ctx.Value(logLevelKey).(slog.Level)
	return v, ok
}

// ParseLevel — fail-safe ENV → slog.Level decoder. Unknown / empty → Info.
// Case-insensitive. Используется в main.go: ParseLevel(envOr("LOG_LEVEL", "info")).
func ParseLevel(s string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "debug":
		return slog.LevelDebug
	case "info":
		return slog.LevelInfo
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// piiScrubHandler — slog.Handler middleware that:
//  1. Adds default attrs (service / env / version / request_id) на каждую запись.
//  2. Walks record.Attrs() и:
//     • drops Attr если IsDenied(key);
//     • replaces key+value с "email_hash"+HashEmail(value) если ShouldHash(key);
//     • иначе passthrough.
//  3. Respects per-context LogLevel override via WithLogLevel/LogLevelFromContext.
type piiScrubHandler struct {
	inner slog.Handler
	cfg   Config
}

// Enabled — slog.Handler interface. Returns true если record's level passes
// either baseline или per-context override. Used by stdlib BEFORE Handle().
func (h *piiScrubHandler) Enabled(ctx context.Context, lvl slog.Level) bool {
	if override, ok := LogLevelFromContext(ctx); ok && lvl >= override {
		return true
	}
	return lvl >= h.cfg.Level
}

// Handle — core scrub + default-attr injection. Called per record.
func (h *piiScrubHandler) Handle(ctx context.Context, r slog.Record) error {
	// Re-emit с filtered attrs. slog.Record не immutable во всех частях, но
	// Attrs мы пересобираем через clone-and-walk per stdlib convention.
	clone := slog.NewRecord(r.Time, r.Level, r.Message, r.PC)

	// Default attrs (always present)
	clone.AddAttrs(
		slog.String("service", h.cfg.ServiceName),
		slog.String("env", h.cfg.Env),
		slog.String("version", h.cfg.Version),
	)
	if rid, ok := RequestIDFromContext(ctx); ok {
		clone.AddAttrs(slog.String("request_id", rid))
	} else {
		// Always emit request_id field (empty string) — keeps log schema stable
		// для downstream consumers (Grafana / Loki LogQL filters).
		clone.AddAttrs(slog.String("request_id", ""))
	}

	// Walk caller's attrs, scrub
	r.Attrs(func(a slog.Attr) bool {
		key := a.Key
		switch {
		case IsDenied(key):
			// Drop entirely (D-12 minimum-information principle).
			return true
		case ShouldHash(key):
			// Replace key + value (D-10 email_hash).
			clone.AddAttrs(slog.String("email_hash", HashEmail(a.Value.String())))
			return true
		default:
			clone.AddAttrs(a)
			return true
		}
	})

	return h.inner.Handle(ctx, clone)
}

// WithAttrs — passthrough wrapper. Все attrs от WithAttrs тоже scrub'аются
// (через AttrsFromGroup pattern — stdlib слой ниже фильтрации). Поскольку
// у нас flat handler, проще оборачивать wrapped inner.
func (h *piiScrubHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	// Pre-filter attrs (scrub at WithAttrs time AND at Handle time = double).
	filtered := make([]slog.Attr, 0, len(attrs))
	for _, a := range attrs {
		switch {
		case IsDenied(a.Key):
			continue
		case ShouldHash(a.Key):
			filtered = append(filtered, slog.String("email_hash", HashEmail(a.Value.String())))
		default:
			filtered = append(filtered, a)
		}
	}
	return &piiScrubHandler{
		inner: h.inner.WithAttrs(filtered),
		cfg:   h.cfg,
	}
}

// WithGroup — passthrough.
func (h *piiScrubHandler) WithGroup(name string) slog.Handler {
	return &piiScrubHandler{
		inner: h.inner.WithGroup(name),
		cfg:   h.cfg,
	}
}

// NewSlogJSONHandler returns a *slog.Logger that emits JSON to os.Stdout с
// PII-scrub layer + default service/env/version/request_id attrs.
//
// Usage in service main.go (D-32):
//
//	logger := observability.NewSlogJSONHandler(observability.Config{
//	    ServiceName: "identity",
//	    Env:         envOr("ENV", "prod"),
//	    Version:     envOr("BUILD_VERSION", "dev"),
//	    Level:       observability.ParseLevel(envOr("LOG_LEVEL", "info")),
//	})
//	slog.SetDefault(logger)
func NewSlogJSONHandler(cfg Config) *slog.Logger {
	// Inner emits JSON to stdout. Source filename/line disabled (noisy + costs).
	// Level on the JSONHandler is the LOWEST possible — actual gating lives in
	// piiScrubHandler.Enabled so per-request overrides могут поднять level
	// для конкретного запроса.
	base := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level:     slog.LevelDebug, // permissive — wrapper enforces real gate
		AddSource: false,
	})
	return slog.New(&piiScrubHandler{inner: base, cfg: cfg})
}
