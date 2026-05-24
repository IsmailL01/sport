# 05-04-SUMMARY — Prom `/metrics` + middleware + 3 dashboards + cardinality CI gate

**Plan:** 05-04 (Wave 3 — autonomous=true)
**Requirements:** OBS-05, OBS-07
**Executed:** 2026-05-19 → 2026-05-20 (gsd-executor run cut off by 2 socket drops; closeout completed inline by orchestrator)
**Commits:** `975a048`, `0d9c823`, `381f003`, `515ca90`
**Status:** ✅ Complete

---

## What landed

### Task 1 — `pkg/observability` Prom seam (commit `975a048`)

New `pkg/observability` artifacts wired with `prometheus/client_golang` v1.20.5 (RESEARCH §4 pin):

- **`metrics.go`** (149 lines) — 6 D-17 `promauto`-registered metric families with explicit label keys + buckets:
  - `http_request_duration_seconds` (histogram) — labels `service`, `route`, `method`, `status_class`; buckets `[5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s]`
  - `http_requests_total` (counter) — same labels minus duration
  - `jwt_validation_total` (counter) — labels `service`, `result` (`ok`/`expired`/`invalid_signature`/`malformed`)
  - `nats_consumer_pending` (gauge) — labels `service`, `consumer`, `stream`
  - `db_query_duration_seconds` (histogram) — labels `service`, `op` (`select`/`insert`/`update`/`delete`/`tx`)
  - `external_api_duration_seconds` (histogram) — labels `service`, `provider`, `status_class`
  - All 6 descriptors enforce D-18 forbidden-label-free contract (no `user_id`, `session_id`, `device_id`, `external_uuid`, `email`, `phone`).
- **`promhttp_middleware.go`** (185 → 214 lines after Hijacker fix) — `PromhttpMiddleware(serviceName, next)`:
  - `statusRecorder` wraps `ResponseWriter`; records `WriteHeader(code)` → `status_class` reduced to ≤5 buckets (`2xx`/`3xx`/`4xx`/`5xx`/`other`) per D-18 cardinality budget
  - Go 1.22+ `r.Pattern` extraction prevents Pitfall #6 (never label by raw `URL.Path` — high-cardinality bombs)
  - Fallback collapse when `r.Pattern` empty (handler doesn't use mux) — drops to method-only template
  - Implicit-200 defense (when handler never calls WriteHeader)
  - Empty-service-name defense (defaults to `"unknown"` rather than emitting `service=""`)
- **`metrics_test.go`** (166 lines) — descriptor-level D-18 enforcement (`TestMetrics_NoForbiddenLabels` iterates `prometheus.DefaultRegisterer.Gather()` desc strings), D-17 bucket-array assertion, all-6-families presence check.
- **`promhttp_middleware_test.go`** (372 → 434 lines after Hijacker fix) — 10 → 13 tests: status classification, route template extraction (both Go 1.22 mux + fallback collapse), implicit-200, empty-service-name, Hijacker passthrough (added in `0d9c823`), Flusher passthrough.
- **`pkg/go.mod`** — `prometheus/client_golang v1.20.5` added.
- `go test ./pkg/observability/...` exits 0 (race + non-race); `go vet` clean.

### Task 2 — wire 8 Go services (commits `0d9c823` + `381f003`)

8 Go services updated (gateway is Caddy, not a Go target — per 05-04-PLAN `files_modified` it's listed only because the prometheus.yml scrape config references `gateway:8080`, not because gateway runs a Go server). Each service's `cmd/server/main.go` now:

1. Imports `github.com/prometheus/client_golang/prometheus/promhttp`
2. Declares package-level `const serviceName = "<svc>"` per D-32 — replaces inline literal in `observability.NewSlogJSONHandler` call; used as Prom `service` label, slog `service` attr, and future Sentry `setTag("service", ...)` in Plan 05-05
3. Builds inner `http.NewServeMux()`:
   ```go
   mux := http.NewServeMux()
   mux.Handle("/metrics", promhttp.Handler())
   mux.Handle("/", h.Routes())
   ```
4. Wraps chain (innermost → outermost): existing routes → inner mux → `clientversion.Middleware(...)` → `observability.PromhttpMiddleware(serviceName, ...)` as `http.Server.Handler`
5. `clientversion`'s `SkipPaths` includes `/metrics` so version negotiation passes through

**`realtime-gw` special-case (commit `0d9c823`)** — WS service. `statusRecorder` originally broke `coder/websocket.Accept()` because that library calls `Hijack()` to take over the raw TCP socket post-upgrade. Fix: `statusRecorder` now implements `http.Hijacker` and `http.Flusher` via type-assertion passthrough to the underlying `ResponseWriter`. Without this fix realtime-gw returned `"http.Hijacker not implemented"` on WS upgrade. 3 new tests cover Hijacker/Flusher passthrough + the "wrap a non-Hijacker writer" defensive path.

Services wired (8 of 8 Go targets):
- identity, activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph

`go build ./identity/... ./activity-sync/... ./feed/... ./media/... ./messaging/... ./notifications/... ./realtime-gw/... ./social-graph/... ./pkg/...` exits 0. `go vet` clean.

### Task 3 — dashboards + cardinality probe + CI gate + branch protection (commit `515ca90`)

- **`services/backend/observability/dashboards/backend-overview.json`** (223 lines) — 4 panels: P99 latency (`histogram_quantile(0.99, sum by (le, service) (rate(http_request_duration_seconds_bucket[5m])))`), 5xx error rate (`sum by (service) (rate(http_requests_total{status_class="5xx"}[5m])) / sum by (service) (rate(http_requests_total[5m]))`), JWT validation failures (`sum by (service, result) (rate(jwt_validation_total{result!="ok"}[5m]))`), request throughput (`sum by (service) (rate(http_requests_total[5m]))`). Pre-wired to `${DS_PROMETHEUS}` datasource variable so Plan 05-06 Ansible can `cp` straight into Grafana provisioning.
- **`services/backend/observability/dashboards/nats-jetstream.json`** (142 lines) — `nats_consumer_pending` queue depth gauge + top-10 pending consumers panel. D-26 alert source: `nats_consumer_pending > 1000` for 5min.
- **`services/backend/observability/dashboards/db-performance.json`** (160 lines) — P99 by `op` (select/insert/update/delete/tx) + P50/P95/P99 overall. D-26 alert source: `db_query_duration_seconds{quantile="0.99"} > 0.5` for 5min.
- **`services/backend/observability/prometheus.yml`** (76 lines, +37 over Phase 0 stub) — full 8-Go-service scrape config + Caddy/gateway metrics endpoint + per-service port comments. Templates `prometheus.yml.j2` (37 lines) for prod env (Ansible substitutes `prod_vps_ip` + `services_ports` group_vars in Plan 05-06).
- **`scripts/cardinality_probe.py`** (233 lines, Python stdlib only — no pip deps) — D-18 enforcement: iterates configurable target list, parses Prom exposition format, asserts:
  - Zero forbidden labels (`user_id`, `session_id`, `device_id`, `external_uuid`, `email`, `phone`) in any descriptor
  - ≤1000 series/metric (`--max-series 1000` flag, configurable)
  - `--strict` flag → exit 1 on any violation; `--host` flag → CI-injectable target
- **`scripts/smoke_metrics.py`** (122 lines) — endpoint-up smoke: `GET /metrics` against all targets, asserts HTTP 200 + body contains `HELP http_request_duration_seconds` (per VALIDATION row OBS-05). `--strict` mode checks all 6 D-17 metric family HELP lines.
- **`.github/workflows/backend-ci.yml`** (+53 lines) — new `cardinality-probe` job: boots each Go service container against an ephemeral Postgres+NATS docker network, hits `/metrics`, runs `python3 scripts/cardinality_probe.py --strict`. Failure blocks merge. Python 3.12, stdlib only.
- **`scripts/setup-branch-protection.sh`** — required-checks list extended 9 → 10 entries (`"Cardinality Probe (Prom labels)"` appended after `"PII Audit (slog grep)"` from 05-03). Blocks merge if cardinality_probe.py exits non-zero.

---

## Key files

- **Created:**
  - `services/backend/pkg/observability/metrics.go`
  - `services/backend/pkg/observability/metrics_test.go`
  - `services/backend/pkg/observability/promhttp_middleware.go`
  - `services/backend/pkg/observability/promhttp_middleware_test.go`
  - `services/backend/observability/dashboards/backend-overview.json`
  - `services/backend/observability/dashboards/nats-jetstream.json`
  - `services/backend/observability/dashboards/db-performance.json`
  - `services/backend/observability/prometheus.yml.j2`
  - `scripts/cardinality_probe.py`
  - `scripts/smoke_metrics.py`

- **Modified:**
  - `services/backend/pkg/go.mod` + `go.sum` — `prometheus/client_golang v1.20.5`
  - `services/backend/{identity,activity-sync,feed,media,messaging,notifications,realtime-gw,social-graph}/cmd/server/main.go` — promhttp import + `serviceName` const + inner mux + chain wrap
  - `services/backend/pkg/observability/slog_handler.go` — minor (default-attr ordering for compatibility with Plan 05-05 `service` tag pattern)
  - `services/backend/pkg/observability/pii_deny_list.go` + `_test.go` — trivial (1-line + 18-line) — confirmation that PIIDenyList is the canonical source D-21 (re-used by Plan 05-05 OTel span processor)
  - `services/backend/observability/prometheus.yml` — Phase 0 stub → full 8-service scrape config
  - `.github/workflows/backend-ci.yml` — `cardinality-probe` job
  - `scripts/setup-branch-protection.sh` — required-checks list 9 → 10

---

## Acceptance check vs must_haves

| Must-have | Status | Evidence |
|---|---|---|
| Every service exposes /metrics on its own port (HTTP 200, HELP/TYPE lines) | ✓ | `grep -l promhttp.Handler` returns all 8 Go services; `scripts/smoke_metrics.py` validates HELP lines |
| 6 D-17 metric families present | ✓ | `metrics.go` (lines 1-149) + `TestMetrics_AllFamiliesRegistered` |
| Cardinality probe detects 0 forbidden labels + ≤1000 series/metric | ✓ | `scripts/cardinality_probe.py` lines 40-95 (FORBIDDEN_LABELS const) + `--max-series` enforcement; descriptor-level test in `metrics_test.go` |
| PromhttpMiddleware uses templated mux route (Pitfall #6) | ✓ | `promhttp_middleware.go` uses `r.Pattern` (Go 1.22+); test `TestPromhttpMiddleware_RouteTemplateExtraction` covers both happy + fallback paths |
| 3 Grafana dashboards committed, datasource-wired | ✓ | `services/backend/observability/dashboards/{backend-overview,nats-jetstream,db-performance}.json` |
| prometheus.yml jinja-templated for prod | ✓ | `prometheus.yml.j2` (37 lines) — `prod_vps_ip` + `services_ports` placeholders |
| CI cardinality-probe job blocks merge on failure | ✓ | `.github/workflows/backend-ci.yml` `cardinality-probe` job + `setup-branch-protection.sh` includes `"Cardinality Probe (Prom labels)"` |

---

## Notes for downstream plans

- **Plan 05-05 (OTel + sentry-go SDK):** The chain order is now `PromhttpMiddleware(outer) → clientversion.Middleware → routes(inner)`. 05-05 inserts `OtelHTTP + SentryRecovery` BETWEEN `PromhttpMiddleware` and `clientversion.Middleware` per 05-04-PLAN frontmatter note. Final chain: `Promhttp → OtelHTTP → SentryRecovery → clientversion → routes`.
- **Plan 05-06 (Ansible alloy-shipper + final acceptance):** Dashboards + `prometheus.yml.j2` already in place — 05-06's Ansible role just copies + `j2`-renders + restarts the observability-stack. The `srv1561293` stack (Plan 05-07) already has Grafana + Prometheus running, awaiting the dashboards + prod scrape config.
- **realtime-gw Hijacker fix** is load-bearing — any future middleware that wraps `ResponseWriter` for WS routes must follow the same Hijacker/Flusher passthrough pattern (or skip wrapping for WS upgrade paths).

---

## Self-Check: PASSED

- [x] All 3 tasks executed
- [x] Each task committed individually (4 commits including realtime-gw Hijacker hotfix)
- [x] SUMMARY.md created
- [x] STATE.md + ROADMAP.md updates committed alongside SUMMARY (orchestrator inline closeout)
- [x] `go build` + `go vet` clean across all 8 Go services
- [x] `go test ./pkg/observability/...` exits 0
- [x] All must_haves verified
