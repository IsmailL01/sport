// sentry_init.go — sentry-go SDK bootstrap + HTTP middlewares.
// Phase 5 / OBS-01 / D-32 / D-33 / D-38.
//
// Конструкция (RESEARCH §1.9 + D-32):
//   - MustInitSentry(SentryConfig) → func() shutdown closure (sentry.Flush(2s)).
//   - **D-38 empty-DSN guard at the top** (ADR-0010 amendment 2026-05-19 PM):
//     если DSN пустой → slog.Info "observability.sentry: disabled — empty DSN"
//     + return func(){}. Это **dormant-by-design path** для v1.0 — Sentry SaaS
//     activation deferred to post-v1.0. SDK code paths preserved; activation =
//     SOPS edit к populate DSN + redeploy (no code change).
//   - **Single shared prod-backend project** (RESEARCH §1.9):
//     SetTag("service", cfg.ServiceName) + SetTag("env", cfg.Env). Все 8
//     сервисов шлют в один project; tag filtering discriminates.
//   - TracesSampleRate = 1.0 (RESEARCH §P15 closed-beta scale).
//   - Defense-in-depth: sentry-go SDK сам no-op'ит на empty DSN, но explicit
//     guard делает dormant state observable на boot (D-38 contract — prevents
//     silent "events go nowhere" failure mode).
//
// HTTP middlewares:
//   - SentryRecoveryMiddleware(next) — panic recovery + per-request Hub.
//     Использует upstream `sentryhttp.New(...).Handle(next)` — proven pattern,
//     не пересобираем.
//   - OtelHTTPMiddleware(serviceName, next) — one-line wrapper над
//     otelhttp.NewHandler. Создаёт root HTTP span per request; PII-attribute
//     scrub живёт в TracerProvider's piiScrubProcessor (см. otel_init.go).
//
// Middleware chain (D-32 / per 05-04 SUMMARY note):
//
//	rootHandler := observability.PromhttpMiddleware(serviceName,
//	    observability.SentryRecoveryMiddleware(
//	        observability.OtelHTTPMiddleware(serviceName, versionedMux)))
//
// Здесь Promhttp — outermost (видит итоговый wall-clock включая OTel/Sentry
// overhead); SentryRecovery → OtelHTTP → clientversion → routes — внутрь.
package observability

import (
	"bufio"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/getsentry/sentry-go"
	sentryhttp "github.com/getsentry/sentry-go/http"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

// SentryConfig — runtime-конфиг для MustInitSentry.
type SentryConfig struct {
	// DSN — Sentry DSN. Пустая строка → D-38 dormant path.
	DSN string

	// Env — "prod" | "staging" | "dev". Эмитится как scope tag "env".
	Env string

	// Release — git SHA / build ID. Передаётся в sentry.ClientOptions.Release.
	Release string

	// ServiceName — e.g., "identity". Эмитится как scope tag "service".
	// Discriminator в single-project model (RESEARCH §1.9).
	ServiceName string

	// SampleRate — TracesSampleRate. Если 0 — default 1.0 (RESEARCH §P15).
	SampleRate float64
}

// MustInitSentry initializes sentry-go SDK + configures per-service scope tags.
// Returns shutdown closure (sentry.Flush(2s)).
//
// D-38 contract: пустой DSN → no-op + INFO log. Dormant-by-design path для
// v1.0 deferral per ADR-0010 amendment 2026-05-19 PM. Activation post-v1.0 =
// SOPS edit к populate DSN + redeploy.
//
// sentry.Init errors (НЕ пустой DSN, но broken) → WARN log + no-op closure.
// Observability не должна крашить service start.
func MustInitSentry(cfg SentryConfig) func() {
	// D-38 dormant-by-design path — empty DSN, Sentry SaaS activation deferred.
	if cfg.DSN == "" {
		slog.Info("observability.sentry: disabled — empty DSN",
			"next_step", "see ADR-0010 amendment 2026-05-19 PM")
		return func() {} // no-op shutdown
	}

	// Default sample rate per RESEARCH §P15.
	if cfg.SampleRate <= 0 {
		cfg.SampleRate = 1.0
	}

	err := sentry.Init(sentry.ClientOptions{
		Dsn:              cfg.DSN,
		Environment:      cfg.Env,
		Release:          cfg.Release,
		TracesSampleRate: cfg.SampleRate,
	})
	if err != nil {
		// SDK init failure (broken DSN, network unreachable, etc.) —
		// degrade gracefully. NOT crashing service.
		slog.Warn("sentry-go init failed; SDK disabled",
			"err", err.Error())
		return func() {}
	}

	// Tag-based discrimination per RESEARCH §1.9 (single shared project model).
	sentry.ConfigureScope(func(scope *sentry.Scope) {
		scope.SetTag("service", cfg.ServiceName)
		scope.SetTag("env", cfg.Env)
	})

	return func() {
		// 2s flush timeout — see RESEARCH §1.9. Достаточно для batch flush
		// при graceful shutdown; не блокирует SIGTERM-handler дольше необходимого.
		sentry.Flush(2 * time.Second)
	}
}

// SentryRecoveryMiddleware wraps next с panic recovery + per-request Hub +
// 500 response writing. Composes upstream sentryhttp.Handler (capture+hub) с
// нашим тонким internal-server-error response wrapper.
//
// Behavior:
//   - sentryhttp inner: capture'ит exception, отправляет в Sentry с current
//     scope tags (service + env from MustInitSentry's ConfigureScope), per-
//     request Hub isolation. Repanic=false → не выкидывает naked panic stack.
//   - 500-writer outer: если handler panicked И headers ещё не были написаны,
//     пишет `HTTP 500 Internal Server Error\nInternal Server Error\n`. Если
//     headers уже отправлены (e.g., streaming response уже начался), 500
//     написать невозможно — sentryhttp хотя бы захватит event.
//   - Не вмешивается в non-panic flow.
//
// Hijacker/Flusher passthrough: sentryhttp.Handler в текущих версиях SDK
// (v0.46.x) корректно проксирует ResponseWriter interfaces. Наш outer-wrapper
// trackHeaderWriter тоже проксирует Hijacker/Flusher для realtime-gw WS
// upgrade compatibility (mirror pattern of statusRecorder в promhttp_middleware.go,
// commit 0d9c823).
func SentryRecoveryMiddleware(next http.Handler) http.Handler {
	mw := sentryhttp.New(sentryhttp.Options{
		Repanic:         true, // re-panic so outer wrapper может написать 500
		WaitForDelivery: false,
		Timeout:         2 * time.Second,
	})
	inner := mw.Handle(next)

	// Outer wrapper: catches the re-panic and writes 500.
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := &headerWroteRecorder{ResponseWriter: w}
		defer func() {
			if rvr := recover(); rvr != nil {
				// sentryhttp уже captured the event (inner's recoverWithSentry
				// fired ДО re-panic'a). Здесь только пишем 500-response если
				// headers ещё не были отправлены.
				if !rec.wroteHeader {
					http.Error(w, "Internal Server Error", http.StatusInternalServerError)
				}
				// Не re-panic'аем — обработали финально.
			}
		}()
		inner.ServeHTTP(rec, r)
	})
}

// headerWroteRecorder — minimal wrapper для tracking whether WriteHeader был
// вызван. Используется в SentryRecoveryMiddleware для решения "writeful 500"
// при панике в handler.
//
// Hijacker/Flusher passthrough (mirror pattern of statusRecorder в
// promhttp_middleware.go) — критично для WS upgrade в realtime-gw.
type headerWroteRecorder struct {
	http.ResponseWriter
	wroteHeader bool
}

func (r *headerWroteRecorder) WriteHeader(code int) {
	r.wroteHeader = true
	r.ResponseWriter.WriteHeader(code)
}

func (r *headerWroteRecorder) Write(b []byte) (int, error) {
	if !r.wroteHeader {
		r.wroteHeader = true
	}
	return r.ResponseWriter.Write(b)
}

// Hijack — passthrough к underlying ResponseWriter (для realtime-gw WS).
func (r *headerWroteRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if h, ok := r.ResponseWriter.(http.Hijacker); ok {
		return h.Hijack()
	}
	return nil, nil, errSentryRecorderNotHijacker
}

// Flush — passthrough для SSE / streaming handlers.
func (r *headerWroteRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

var errSentryRecorderNotHijacker = errors.New(
	"observability.SentryRecoveryMiddleware: underlying ResponseWriter does not implement http.Hijacker")

// OtelHTTPMiddleware — one-line wrapper над otelhttp.NewHandler.
// Создаёт root HTTP span per incoming request; attribute scrubbing
// (PIIDenyList) выполняется в TracerProvider's piiScrubProcessor (см.
// otel_init.go), а не здесь — single-source-of-truth.
//
// `serviceName` используется как span operation name. otelhttp автоматически
// прикрепляет semconv attributes: http.method, http.target, http.status_code,
// net.peer.ip, etc. Из них http.target может содержать full URL.Path — это
// потенциальный высококардинальный signal (см. Pitfall #6), но OTel здесь
// trade-off приемлим: span data не агрегируется как Prom metrics, а Sentry
// дедупит spans по trace_id.
//
// Hijacker passthrough: otelhttp в современных версиях (v0.57.0) корректно
// проксирует ResponseWriter interfaces через httpsnoop. Для realtime-gw WS
// upgrade работает out-of-the-box (см. felixge/httpsnoop dep).
func OtelHTTPMiddleware(serviceName string, next http.Handler) http.Handler {
	return otelhttp.NewHandler(next, serviceName)
}
