// metrics.go — package-level Prometheus metric registrations для всех 8 Go
// backend services. Phase 5 / OBS-05 / OBS-07 / D-15 / D-16 / D-17 / D-18.
//
// Этот файл — единственный источник правды для D-17 метрик. Каждый сервис
// импортирует pkg/observability и автоматически (через promauto.New*Vec на
// init time) регистрирует все 6 семейств в prometheus.DefaultRegisterer.
//
// Cardinality budget (D-18):
//   - Запрещённые метки: user_id, session_id, device_id, external_uuid,
//     email, phone — НЕ должны появляться ни на одной метрике. Это
//     enforced на трёх уровнях:
//       1. На уровне registration time — этот файл не определяет ни одного
//          *_user_id label key. См. TestHTTPRequestDuration_LabelKeys.
//       2. На уровне runtime probe — scripts/cardinality_probe.py
//          парсит /metrics output каждого сервиса и проверяет отсутствие
//          forbidden labels + ≤1000 series/metric.
//       3. На уровне CI — backend-ci.yml `cardinality-probe` job блокирует
//          merge при появлении forbidden label в exposed metrics.
//   - Bucketed labels (allowed): user_cohort (≤10), route (≤50/service),
//     method (5 verbs), status (5 classes: 2xx/3xx/4xx/5xx/other), provider
//     (≤10).
//
// Histogram buckets (D-17): [5ms..10s] логарифмическая сетка — оптимальна для
// HTTP / DB / external API timings в нашем диапазоне (p50 ~30ms, p99 <2s
// баseline). Не меняйте без обновления PromQL alert rules в
// infra/observability-stack/grafana/provisioning/alerting/rules.yml.
package observability

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// stdBuckets — общие buckets для HTTP/DB/external-API histograms.
// 11 buckets покрывают диапазон 5 ms .. 10 s; histogram_quantile(0.99, ...)
// даёт хорошее разрешение на P50 / P95 / P99.
var stdBuckets = []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10}

// HTTPRequestDuration — длительность HTTP request в секундах, по сервису,
// HTTP-методу, route-template и status class. Buckets per D-17.
//
// Labels (D-18 cardinality budget):
//   - service: ServiceName из observability.Config (≤8 значений)
//   - method: HTTP verb (GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS — ≤7)
//   - route: route template из mux.Handler() ИЛИ collapsed fallback
//     `/api/<seg>` (Pitfall #6 — никогда не raw r.URL.Path)
//   - status: 2xx | 3xx | 4xx | 5xx | other (5 classes per D-18)
//
// Total cardinality на сервис: ~7 methods × 50 routes × 5 statuses = 1750 —
// THRESHOLD-aware. Probe-cap = 1000 series/metric из scripts/cardinality_probe.py;
// если за 1000 — план плохо выбрал route fallback или mux template extraction.
//
// NO user_id / session_id / device_id (D-18 — enforced at descriptor level
// + verified by TestHTTPRequestDuration_LabelKeys).
var HTTPRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
	Name:    "http_request_duration_seconds",
	Help:    "HTTP request duration in seconds, by service, method, route template, and status class (D-17).",
	Buckets: stdBuckets,
}, []string{"service", "method", "route", "status"})

// HTTPRequestsTotal — счётчик HTTP-запросов с теми же labels что
// HTTPRequestDuration. Error-rate derivable как:
//   sum by (service) (rate(http_requests_total{status="5xx"}[5m]))
//   / sum by (service) (rate(http_requests_total[5m]))
//
// См. infra/observability-stack/grafana/provisioning/alerting/rules.yml
// rule `5xx-rate-over-5pct`.
var HTTPRequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
	Name: "http_requests_total",
	Help: "Total HTTP requests, by service, method, route template, and status class (D-17).",
}, []string{"service", "method", "route", "status"})

// JWTValidationTotal — счётчик попыток валидации JWT.
//
// Labels:
//   - service
//   - result: "ok" | "expired" | "invalid" | "missing"
//
// Cardinality: 8 services × 4 results = 32 series. Тривиальная.
//
// Dashboard target (ROADMAP criterion 4): JWT validation failures panel.
// Alert: `jwt-validation-failure-spike` (>20/min — D-26).
var JWTValidationTotal = promauto.NewCounterVec(prometheus.CounterOpts{
	Name: "jwt_validation_total",
	Help: "Total JWT validation attempts by service and result (D-17).",
}, []string{"service", "result"})

// NATSConsumerPending — текущее число pending messages в NATS JetStream
// consumer. Gauge (изменяется в обе стороны).
//
// Labels:
//   - service: какой сервис делает scrape (обычно сам consumer)
//   - stream: NATS stream name
//   - consumer: NATS consumer name
//
// Cardinality budget: ≤8 services × ≤5 streams × ≤10 consumers = ≤400 series.
// Probe-cap 1000 даёт headroom.
//
// Dashboard target (ROADMAP criterion 4): queue-depth panel.
// Alert: `nats-consumer-lag-gt-1000` (D-26).
var NATSConsumerPending = promauto.NewGaugeVec(prometheus.GaugeOpts{
	Name: "nats_consumer_pending",
	Help: "Pending messages count per NATS JetStream consumer (D-17).",
}, []string{"service", "stream", "consumer"})

// DBQueryDuration — длительность SQL queries в секундах.
//
// Labels:
//   - service
//   - operation: "select" | "insert" | "update" | "delete" | "txn"
//
// Cardinality: 8 services × 5 ops = 40 series. Низко.
//
// Alert: `db-p99-over-500ms` warning (D-26).
var DBQueryDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
	Name:    "db_query_duration_seconds",
	Help:    "Database query duration in seconds, by service and operation type (D-17).",
	Buckets: stdBuckets,
}, []string{"service", "operation"})

// ExternalAPIDuration — длительность внешних HTTP-вызовов (Mapbox/Strava/
// Expo Push/Telegram/...).
//
// Labels:
//   - service
//   - provider: "mapbox" | "strava" | "expo_push" | "telegram" | ...
//
// Cardinality: 8 services × ≤10 providers = ≤80 series.
//
// Alert: `external-api-error-rate-over-10pct` warning (D-26 — note: counts
// errors via separate counter; this histogram tracks latency).
var ExternalAPIDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
	Name:    "external_api_duration_seconds",
	Help:    "External (third-party) API call duration in seconds, by service and provider (D-17).",
	Buckets: stdBuckets,
}, []string{"service", "provider"})

// D17MetricNames — список всех 6 семейств метрик в стандартном D-17 наборе.
// Используется тестами + scripts/smoke_metrics.py для проверки, что каждый
// сервис эмиттит все 6 (HELP-строка present в /metrics output).
var D17MetricNames = []string{
	"http_request_duration_seconds",
	"http_requests_total",
	"jwt_validation_total",
	"nats_consumer_pending",
	"db_query_duration_seconds",
	"external_api_duration_seconds",
}
