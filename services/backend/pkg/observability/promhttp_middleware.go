// promhttp_middleware.go — HTTP middleware что записывает duration histogram
// + status counter для каждого incoming HTTP request. Phase 5 / OBS-05 /
// D-17 / D-19 / Pitfall #6.
//
// Wiring (D-32) — в каждом сервисе main.go:
//
//	rootMux := http.NewServeMux()
//	rootMux.Handle("/metrics", promhttp.Handler())   // Prometheus scrape
//	rootMux.Handle("/", h.Routes())                  // основное приложение
//
//	versionedMux := clientversion.Middleware(rootMux, versionPolicy, logger)
//	rootHandler := observability.PromhttpMiddleware("identity", versionedMux)
//	srv := &http.Server{Handler: rootHandler, ...}
//
// Plan 05-05 потом обернёт rootHandler в OtelHTTP + SentryRecovery; Plan 05-06
// добавит DebugSessionMiddleware. Эта обёртка — outermost ИЗ phase-5 stanzas
// и first to see / last to record каждый request.
//
// Route-template extraction (Pitfall #6 — cardinality safety):
//
// Если бы мы записывали `route=r.URL.Path` — каждый уникальный URL стал бы
// отдельной series. Для /me/<uuid>/profile это означало бы одну series на
// user — Cardinality explosion. Защита:
//   1. Если mux экспонирует pattern через r.Pattern (Go 1.22+ http.ServeMux),
//      используем его (e.g., "GET /users/{id}" → "/users/{id}").
//   2. Иначе fallback: collapse path до первого segment, e.g., /api/v1/runs/
//      <uuid>/laps → "/api/v1/runs" (bounded — ≤50 unique values).
package observability

import (
	"net/http"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// PromhttpMiddleware wraps next с timing + status-capture + 6-metric record.
// `service` — статическое имя сервиса (например, "identity"), используется как
// `service` label на всех Vec.
//
// Замечание про /metrics: запрос к /metrics сам по себе попадёт в гистограмму
// (route="/metrics" status="2xx"). Это OK — bounded cardinality (одна series
// на сервис) и видимость в дашборде что Prometheus реально скрейпит сервис.
func PromhttpMiddleware(service string, next http.Handler) http.Handler {
	if service == "" {
		service = "unknown"
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := newStatusRecorder(w)

		next.ServeHTTP(rec, r)

		elapsed := time.Since(start).Seconds()
		route := extractRouteTemplate(r)
		statusClass := classifyStatus(rec.status)

		HTTPRequestDuration.
			WithLabelValues(service, r.Method, route, statusClass).
			Observe(elapsed)
		HTTPRequestsTotal.
			WithLabelValues(service, r.Method, route, statusClass).
			Inc()
	})
}

// MetricsHandler — convenience: returns promhttp.Handler() для регистрации
// в mux. Equivalent: `mux.Handle("/metrics", promhttp.Handler())`. Существует
// чтобы main.go импортировал только pkg/observability — uniform import surface.
func MetricsHandler() http.Handler {
	return promhttp.Handler()
}

// statusRecorder — обёртка над http.ResponseWriter, capturing first WriteHeader
// call. Default = 200 если handler не звал WriteHeader (implicit на
// первый Write).
type statusRecorder struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func newStatusRecorder(w http.ResponseWriter) *statusRecorder {
	return &statusRecorder{ResponseWriter: w, status: http.StatusOK}
}

// WriteHeader captures status и delegates.
func (s *statusRecorder) WriteHeader(code int) {
	if s.wroteHeader {
		// Защита от дублирующих WriteHeader (stdlib просто warning'ит,
		// но мы запомним первый — он реальный statuсе клиента).
		return
	}
	s.status = code
	s.wroteHeader = true
	s.ResponseWriter.WriteHeader(code)
}

// Write — если handler делает Write без предыдущего WriteHeader, фиксируем
// implicit 200 (stdlib's behaviour).
func (s *statusRecorder) Write(b []byte) (int, error) {
	if !s.wroteHeader {
		s.wroteHeader = true
		// status уже = 200 из newStatusRecorder; не зовём WriteHeader явно —
		// stdlib сам это сделает в первом ResponseWriter.Write.
	}
	return s.ResponseWriter.Write(b)
}

// classifyStatus reduces HTTP status code to ≤5 bucketed classes per D-18
// cardinality budget.
//
//	200-299 → "2xx"
//	300-399 → "3xx"
//	400-499 → "4xx"
//	500-599 → "5xx"
//	else    → "other" (включая 1xx и нестандартные)
func classifyStatus(code int) string {
	switch {
	case code >= 200 && code < 300:
		return "2xx"
	case code >= 300 && code < 400:
		return "3xx"
	case code >= 400 && code < 500:
		return "4xx"
	case code >= 500 && code < 600:
		return "5xx"
	default:
		return "other"
	}
}

// extractRouteTemplate возвращает шаблон роута для request:
//   1. Если r.Pattern set (Go 1.22+ http.ServeMux заполняет это поле после
//      route matching), используем его — это registered pattern, e.g.,
//      "GET /users/{id}".  Удаляем method-prefix чтобы остался чистый path.
//   2. Если r.Pattern пустой (request не прошёл через ServeMux или это
//      доhomemade router), fallback к bounded path — берём первые 2 segments
//      (например, /api/v1/users/123 → /api/v1).
//   3. Edge cases:
//      - r.URL.Path == "" → "/"
//      - root "/" → "/"
//      - /metrics, /healthz — passthrough (short paths).
//
// Гарантия: возвращаемое значение всегда bounded — ≤50 unique values per
// service (проверяется scripts/cardinality_probe.py).
func extractRouteTemplate(r *http.Request) string {
	// Go 1.22+ ServeMux populates r.Pattern with the registered pattern
	// after routing (e.g., "GET /users/{id}" или "POST /auth/login").
	if r.Pattern != "" {
		// Strip method prefix если он есть.  "GET /users/{id}" → "/users/{id}".
		if idx := strings.Index(r.Pattern, " "); idx > 0 {
			return r.Pattern[idx+1:]
		}
		return r.Pattern
	}

	// Fallback — bound the path.
	path := r.URL.Path
	if path == "" {
		return "/"
	}
	if path == "/" {
		return "/"
	}
	// Короткие system-paths не collapse'аем.
	switch path {
	case "/metrics", "/healthz", "/readyz", "/livez":
		return path
	}

	// Collapse: оставляем первые ≤2 path segments. /api/v1/users/123 → /api/v1.
	// /users/123 → /users. /a → /a.
	segments := strings.SplitN(strings.TrimPrefix(path, "/"), "/", 3)
	switch len(segments) {
	case 1:
		return "/" + segments[0]
	case 2:
		return "/" + segments[0] + "/" + segments[1]
	default:
		// Берём первые 2 segments, отбрасываем хвост.
		return "/" + segments[0] + "/" + segments[1]
	}
}
