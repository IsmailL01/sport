# Phase 5: Observability (backend) — Context

**Gathered:** 2026-05-18
**Status:** Ready for planning
**Milestone:** v1.0 Production Readiness
**Workstream:** `backend`
**Depends on:** Phase 3 (Ansible deploy seam — reused для sentry-vps role)
**Mode:** Autonomous (`--auto`-equivalent per persistent no-questions instruction; mirrors Phase 2/3/4 CONTEXT posture)

<domain>
## Phase Boundary

**What this phase delivers:** Take backend from "no crash reporting anywhere, `slog.InfoContext` calls scattered с unstructured + PII-leaking attributes (OTP `code` field unconditionally logged, email/displayName в plaintext), no `/metrics` endpoints (Prometheus scrape gets 404), no traces, observability stack lives только в `docker-compose.observability.yml` dev profile" → to "(a) Sentry self-hosted on **separate** VPS at `sentry.<sentry-ip>.sslip.io` с own ACME cert (NOT behind app's Caddy — isolation non-negotiable per user redline: losing app + crash reports during incident is unacceptable), (b) 4 Sentry projects scaffolded (`staging-backend` + `prod-backend` now; `staging-mobile` + `prod-mobile` DSN slots для Phase 17 consumption), (c) structured JSON logs via `slog` с PII-scrubbing handler — OTP `code` gated behind devMode, GPS coords / phone / displayName / DM content / `external_uuid` / Mapbox tokens / Strava tokens never emit, (d) Prom `/metrics` endpoint на каждом из 8 Go services via `prometheus/client_golang`, (e) OTLP traces to Sentry's built-in OTLP receiver, (f) Grafana dashboards для P99 / error-rate / queue-depth / JWT-validation-failures, (g) cardinality budget enforced (no per-user_id labels — bucketed cohorts only), (h) tester-mode debug log elevation gated by `X-Debug-Session` header + featureflag, (i) alert routing к Telegram bot webhook (no PagerDuty для 2-dev team), (j) promtail на prod VPS ships container stdout к Loki on sentry VPS."

**4 isolation boundaries enforced:**
1. **Sentry on separate VPS** (NOT colocated с app per user redline)
2. **`sentry.<sentry-ip>.sslip.io` separate Caddy + separate ACME cert** (NOT behind app's existing Caddy на 148.253.214.156)
3. **`staging-backend` / `prod-backend` Sentry projects strictly separate** (hard rule from milestone brief — staging events MUST NOT cross into prod project)
4. **PII-scrubbing slog.Handler wraps every `slog.*` call** (centralized deny-list — adding new PII attribute name without scrubbing trips CI grep audit)

**Out of scope:**
- **Mobile Sentry SDK install** (Phase 17 / CRASH-01..06) — Phase 5 creates 4 projects + ships DSNs to SOPS; Phase 17 wires `apps/mobile-rn/src/observability/sentry.ts` PII-strip middleware + integrates с EAS profile.
- **Settings toggle UI для tester-mode debug logging** (Phase 17 mobile-side) — Phase 5 lands backend `X-Debug-Session: 1` header support + featureflag `tester_debug_logs` gating; mobile Settings toggle (с RU consent banner per OBS-08) is Phase 17 territory.
- **DDoS / WAF rules на sentry VPS Caddy** (Phase 6 EDGE-03 — but only для app's Caddy; sentry VPS Caddy stays default-secure with admin-only via IP allowlist).
- **k6 load + chaos baselines** (Phase 8) — Phase 5 ships dashboards; Phase 8 uses them as baselines.
- **PagerDuty integration** (v1.1 if team grows >2 devs) — Phase 5 uses Telegram bot webhook (free, 2-dev team scale).
- **Sentry release-tag wiring** (Phase 17 — ties release tags из Phase 4 к Sentry release events).
- **Real `<brand>.com` domain** — uses sslip.io за v1.0 closed beta (same pattern as Phase 3 D-18).

</domain>

<scout_findings>
## Current State (verified 2026-05-18 on `feat/cursona-redesign`)

### What's already in place (good baseline)
- **`slog` (Go stdlib) уже используется на 81 call-site across 8 services** — `identity`, `feed`, `media`, `messaging`, `notifications`, `realtime-gw`, `social-graph`, `activity-sync` + `pkg/clientversion`. **No Zap, no Logrus, no zerolog в репо.** Phase 5 codifies `slog` choice; OBS-03 ("Zap or slog") collapses к slog.
- **Observability scaffolding в `services/backend/observability/`** — `prometheus.yml` (3-target stub: identity / activity-sync / gateway на `host.docker.internal`), `loki.yml` (single-binary local Loki), `grafana-datasources.yml` (Prom + Loki datasources pre-wired). Phase 0-era; **untouched по Phase 3 D-23** (sentry-prep дefer ed к Phase 5).
- **`services/backend/docker-compose.observability.yml`** — local-dev compose с Prometheus v2.55.0 + Loki 3.2.0 + Grafana 11.3.0 + anonymous-auth Grafana. **DEV-ONLY**; v1.0 productionizes it на separate sentry VPS.
- **`prometheus.yml` already expects `/metrics` endpoints на каждом сервисе** — inline comment: "/metrics endpoint в самих сервисах добавится в P3-B-01 через prometheus client_golang. Сейчас prometheus просто будет ругаться на 404 — это ОК для skeleton". Phase 5 lands the `/metrics` handler per service (OBS-05).
- **`SOPS_AGE_KEY_FILE` + `.secrets/{prod,staging,dev}/{shared,mapbox,oauth}.yaml`** infrastructure из Phase 2 — Phase 5 adds **NEW SOPS slot** `.secrets/{prod,staging}/sentry.yaml` для DSNs + Sentry admin password + Telegram bot token.
- **Ansible roles из Phase 3** — `common`, `docker`, `ufw`, `sport-stack` — **reusable as-is для sentry VPS provisioning**. New `sentry-prep` role wraps Sentry's official `install.sh` orchestrator. Inventory adds `sentry/` group (re-introduces what was dropped in Phase 3 D-23 — Phase 5 is the rightful owner).

### What's missing / broken (Phase 5 scope)
- **No `prometheus/client_golang` import anywhere** — verified by `grep -rn "promhttp|github.com/prometheus" services/backend/` returning only `docker-compose.observability.yml` (the prom container itself) + comment в `prometheus.yml`. Zero service has `/metrics` endpoint yet.
- **No `otel` / `opentelemetry` import anywhere** — verified by `grep -rn "otlp|otel|opentelemetry" services/backend/` returning **zero hits**. Greenfield для OTLP traces.
- **No `sentry-go` import anywhere** — verified by `grep -rn "sentry-go|getsentry" services/backend/` returning zero hits. Greenfield для Sentry SDK.
- **OTP `code` field unconditionally logged** (CONCERNS.md P0 / OBS-04 / fix target):
  - File: `services/backend/identity/internal/service/otp.go:70-74`
  - Code:
    ```go
    slog.InfoContext(ctx, "otp issued",
        "email", email,
        // Dev-mode logging only. В production не логируем code.
        "code", code,
    )
    ```
  - Comment claims dev-mode-only but `"code"` attribute always emits. Anyone с log read-access → full account takeover (email + 6-digit OTP both в same line). Phase 5 fix: gate `code` attribute behind `if devMode { ... }` OR drop entirely from prod path (latter preferred — `devMode` log path uses `slog.WarnContext` separately at lines 111, 124).
- **No structured JSON output configured** — default `slog.Default()` uses `slog.TextHandler` (key=value text format). Phase 5 swaps к `slog.JSONHandler` wrapped в custom PII-scrubbing handler. Single chokepoint in each service's `main.go`.
- **No PII attribute deny-list mechanism** — current `slog.*Context(..., "email", email)` calls emit `email` attribute verbatim. Phase 5 introduces `pkg/observability/slog_scrub.go` wrapper handler that intercepts known-PII attribute keys (`code`, `phone`, `phone_number`, `displayName`, `display_name`, `external_uuid`, `lat`, `lon`, `latitude`, `longitude`, `coords`, `dm_content`, `message_body`, `mapbox_token`, `strava_token`, `jwt`, `refresh_token`) and either drops the entire attribute OR replaces value с `[REDACTED]`. `email` stays (operational signal: who requested code) but gets hashed (SHA-256 first-8-chars) for log-correlation без plaintext.
- **No metrics middleware на handler chain** — none of 8 services produces request-duration histogram, error counter, queue-depth gauge. Phase 5 adds `pkg/observability/promhttp.go` middleware + handler-chain wiring per service.
- **No tester-debug session header** — `X-Debug-Session` header не parsed anywhere. Phase 5 adds `pkg/observability/debug_session.go` middleware that reads header + checks featureflag `tester_debug_logs` (per Phase 1's `pkg/featureflags`) + sets `slog.LevelDebug` для that request's context.
- **No sentry VPS exists** — must provision новый VPS at provider of choice; assume same provider as prod VPS (provider-agnostic per Phase 3 D-25). User-action checkpoint Plan 05-01 Task 0.
- **No Sentry admin user / org / projects scaffolded** — Sentry's `install.sh` prompts для admin email + password on first run; Plan 05-02 uses `--skip-user-prompt` + sets admin via `sentry createuser` CLI invocation.

### Constraints from prior phases
- **Phase 1 (REL-03 / `pkg/featureflags`):** featureflag store + FNV-1a rollout helper available. Phase 5 uses it for `tester_debug_logs` flag (per-user opt-in, default OFF).
- **Phase 2 (SEC-01..09):** SOPS canonical store + envRequire fail-fast helpers + pre-commit gitleaks. **Phase 5 adds `.secrets/{prod,staging}/sentry.yaml` SOPS slot** for: `SENTRY_DSN_BACKEND` (prod-backend project's DSN), `SENTRY_DSN_BACKEND_STAGING` (staging-backend project's DSN — empty until staging lands in v1.1), `SENTRY_ADMIN_PASSWORD` (10-digit randomly-generated), `TELEGRAM_BOT_TOKEN` (alert webhook target), `TELEGRAM_CHAT_ID`. Mobile DSNs (`SENTRY_DSN_MOBILE` + `SENTRY_DSN_MOBILE_STAGING`) created here, consumed by Phase 17.
- **Phase 3 (INFRA-01..07 active):** Ansible deploy seam + 8 service containers under `sport-stack.service` umbrella + provider-agnostic `docs/RUNBOOKS/deploy.md`. **Phase 5 introduces SECOND Ansible target** (`inventory/sentry/hosts.yml`) at `<sentry-ip>` — reuses `common` + `docker` + `ufw` roles verbatim; adds new `sentry-prep` role (wraps Sentry's `install.sh`) + new `promtail-shipper` role (runs on prod VPS, ships logs к Loki on sentry VPS). UFW для sentry VPS: 443 from `0.0.0.0/0` (Sentry web UI + OTLP HTTP ingest + Grafana via Caddy reverse-proxy), 22 rate-limited (D-24 REVISED pattern), 9100 Loki HTTP push (firewalled k `<prod-vps-ip>/32` allowlist — promtail is the only writer).
- **Phase 4 (CICD-01..06):** CI matrix builds 8 services; **Phase 5 extends CI с**: (a) grep-audit step (`! grep -rE 'slog\.\w+Context.*\b(code|phone|displayName|external_uuid|coords|lat|lon)\b' services/backend/`) blocks PR merge on new PII attribute emergence; (b) cardinality probe (parses `prometheus.yml` + builds metric registry from each service's `/metrics` output via `metricfamily` validator — fails if any metric has `user_id` label).

### Carry-forward from Phase 3 / Phase 4 (relevant к Phase 5)
- **Provider-agnostic VPS sourcing** (Phase 3 D-25) — sentry VPS spinup user picks provider (likely same as prod for billing simplicity); `<sentry-ip>` placeholder pattern matches `<vps-ip>` precedent.
- **No staging environment** (Phase 3 D-23) — `staging-backend` Sentry project + `SENTRY_DSN_BACKEND_STAGING` SOPS slot still created (zero marginal cost on self-hosted; ensures clean separation when staging lands в v1.1).
- **GHCR-pull save/scp/load pivot** (Phase 4 deploy.md §5.1) — sentry VPS doesn't pull from GHCR (Sentry's images come from `docker.io/sentry/*` + `getsentry/self-hosted/install.sh` generates compose file pinned к specific tags). Phase 5 sentry-prep role does NOT inherit the save/scp/load pattern — Sentry has its own image-pull seam.
- **Compromised secrets pending rotation** (CONCERNS.md HIGH) — POSTGRES_PASSWORD, JWT_SECRET, MINIO_ROOT_* — **NOT Phase 5 scope** but flagged: Phase 5 introduces NEW secrets (Sentry DSN, admin password, Telegram token) which must NOT transit chat / API. Generate offline + `sops --set` directly.

</scout_findings>

<decisions>
## Implementation Decisions (24 D-XX auto-resolved)

### Sentry deployment topology

- **D-01 (LOCKED upstream by ROADMAP §Phase 5 + user redline):** **Sentry self-hosted on separate VPS** (NOT colocated с app). Isolation non-negotiable: app crash → still need crash reports; correlated failure mode (one VPS dies, both observability + production gone) unacceptable. Not relitigated.
- **D-02:** **Sentry self-hosted edition:** `getsentry/self-hosted` repo (canonical). Pin к specific release tag (e.g., `25.x` LTS-line — researcher confirms latest stable as of 2026-05). Install via repo's `./install.sh --skip-user-prompt --no-report-self-hosted-issues`. Generates ~30-container docker-compose file at `sentry/docker-compose.yml`. Re-runs use plain `docker compose up -d` against generated file. **NOT** Sentry SaaS (user redline: self-hosted non-negotiable).
- **D-03:** **Sentry VPS sizing:** **4 vCPU + 16 GB RAM + 80 GB SSD minimum** (Sentry's official recommendation для self-hosted — Kafka + ClickHouse + Postgres + Redis under one stack; OOM на <8 GB observed in docs). Same provider as prod VPS recommended (single-bill simplicity + same network latency profile если eventually peering); user picks alternative if preferred. Cost estimate ~€20/mo Hetzner CCX23 equivalent. Plan 05-01 Task 0 = user picks/spins VPS.
- **D-04:** **DNS scheme:** `sentry.<sentry-vps-ip-with-dashes>.sslip.io` (e.g., `sentry.85-239-149-26.sslip.io` если sentry-vps gets that IP). sslip.io pattern reuses Phase 3 D-18 (works на любом VPS public IP, не provider-specific). Separate Caddy on sentry VPS handles its own ACME via Let's Encrypt (rate-limit-aware — sentry's compose includes nginx but we replace или sit Caddy в front per RUNBOOK; researcher verifies). **NOT** `sentry.148-253-214-156.sslip.io` (that subdomain points к app VPS — defeats isolation).
- **D-05:** **No subdomain wildcard / staging domain yet.** Phase 5 ships single `sentry.<ip>.sslip.io` for prod. `staging-backend` project lives в same Sentry instance под separate project (DSN-discriminated). When real `<brand>.com` domain lands в v1.1, both Sentry + Grafana migrate behind `sentry.<brand>.com` + `grafana.<brand>.com`.

### Sentry projects + DSN management (OBS-02)

- **D-06:** **4 Sentry projects scaffolded в Phase 5** (zero marginal cost; staging projects stay empty until v1.1):
  - `prod-backend` — receives events from прод Go services (active в Phase 5)
  - `staging-backend` — receives events from future staging Go services (DSN slot created, project empty until staging lands)
  - `prod-mobile` — receives events from production iOS/Android EAS builds (DSN created, consumed by Phase 17)
  - `staging-mobile` — same для staging mobile builds (DSN created, consumed by Phase 17)
- **D-07:** **DSN storage = SOPS** at `.secrets/{prod,staging}/sentry.yaml`. Phase 5 populates `prod/sentry.yaml`:
  ```yaml
  SENTRY_DSN_BACKEND: https://<key>@sentry.<sentry-ip>.sslip.io/<project-id-prod-backend>
  SENTRY_DSN_MOBILE: https://<key>@sentry.<sentry-ip>.sslip.io/<project-id-prod-mobile>
  SENTRY_ADMIN_PASSWORD: <10-char random>
  TELEGRAM_BOT_TOKEN: <bot token from BotFather>
  TELEGRAM_CHAT_ID: <chat ID>
  ```
  `staging/sentry.yaml` has `SENTRY_DSN_BACKEND_STAGING` + `SENTRY_DSN_MOBILE_STAGING` placeholders (empty или real values once staging projects созданы — DSN itself non-secret but stored alongside для grouping).
- **D-08:** **Mobile DSN passthrough** — Phase 5 creates `prod-mobile` + `staging-mobile` projects + ships DSNs to SOPS, but `apps/mobile-rn/` does NOT yet consume them (no `sentry/react-native` SDK installed yet). Phase 17 wires the consumer side + EAS profile env-var injection (`SENTRY_DSN` per profile). Phase 5 ensures DSNs are reachable + valid (verified by `scripts/smoke_sentry.py` POST к `<dsn>/api/store/` returns 200).

### Logging — structured JSON + PII redaction (OBS-03 + OBS-04 + OBS-06)

- **D-09:** **`slog` (Go stdlib) as logging library** — collapses ROADMAP "Zap or slog" к slog. Rationale: 81 call sites уже используют `slog`, zero migration cost; performance differential vs Zap negligible at our scale (8 services, <100 RPS each в closed beta); stdlib means zero dep surface.
- **D-10:** **Custom `slog.Handler` wrapper** at `services/backend/pkg/observability/slog_handler.go` that:
  - Emits JSON output via `slog.NewJSONHandler` underlying
  - Adds default attributes: `service` (from env, e.g., `identity`), `env` (`prod` / `staging` / `dev`), `version` (git SHA from build-time `-ldflags`), `request_id` (from `pkg/middleware/request_id`)
  - **Intercepts each Attr через `Handle` method** and:
    - Drops the entire attribute если key matches `pii_deny_list` (see D-12)
    - Hashes email если key == `email` (SHA-256 first 8 hex chars — operational correlation without plaintext)
    - Passes through otherwise
- **D-11:** **Level configuration via env:** `LOG_LEVEL=info` (default prod) | `debug` (dev / opt-in tester-mode). `slog.LevelInfo` baseline; `LevelDebug` only on per-session basis when `X-Debug-Session: 1` header + featureflag `tester_debug_logs` are both true (per D-22 below).
- **D-12:** **PII deny-list** (case-insensitive attribute key match, dropped entirely from output):
  ```
  code, otp_code, otp
  phone, phone_number, phoneNumber, tel
  displayName, display_name, name (when source is user-controlled — context-dependent; safer = always drop unless explicitly "service_name")
  external_uuid, strava_external_id, garmin_external_id
  lat, lon, latitude, longitude, coords, gps, location
  dm_content, message_body, body, content (когда event is DM/message)
  mapbox_token, strava_token, jwt, access_token, refresh_token, password
  ```
  - Hashed (NOT dropped): `email` → `email_hash` (SHA-256 first 8 hex)
  - Bucketed (allowed): `user_cohort` (e.g., `"new_user"` / `"power_user"`) — used INSTEAD of `user_id` для metrics labels per D-18
- **D-13:** **OBS-04 OTP code fix** — `services/backend/identity/internal/service/otp.go:70-74`:
  - **Before:**
    ```go
    slog.InfoContext(ctx, "otp issued",
        "email", email,
        "code", code,  // ← unconditionally emitted
    )
    ```
  - **After:**
    ```go
    slog.InfoContext(ctx, "otp issued", "email", email)  // code dropped from prod path entirely
    if devMode {
        slog.DebugContext(ctx, "otp dev-mode echo", "email", email, "code", code)
        // ↑ DebugContext only emits at LOG_LEVEL=debug; never emits в prod (Info baseline)
    }
    ```
  - Even если LOG_LEVEL=debug accidentally promoted к prod, the slog_handler's `code` attribute is in `pii_deny_list` → dropped. **Defense-in-depth: gate at call-site AND drop at handler.**
- **D-14:** **CI grep audit gate** — new GH Actions step в `backend-ci.yml` (or separate `pii-audit.yml`):
  ```bash
  # Block PR merge if new slog call leaks PII attribute name
  ! grep -rnE 'slog\.\w+Context\([^)]*"(code|phone|displayName|external_uuid|coords|lat|lon|latitude|longitude|dm_content|mapbox_token|strava_token|jwt|password)"' \
    --include='*.go' \
    --exclude='*_test.go' \
    services/backend/
  ```
  Caught attribute names = exit 1 + PR blocks. Engineer must use scrubbed alternative (`email_hash`, `user_cohort`) или explicitly justify в commit message (then add к whitelist comment).

### Metrics — Prometheus client_golang (OBS-05 + OBS-07)

- **D-15:** **`github.com/prometheus/client_golang` as metrics library** (industry standard, zero alternatives considered — researcher confirms version pin).
- **D-16:** **`/metrics` endpoint per service** — exposes `promhttp.Handler()` on `:<port>/metrics` (same port as service HTTP). Per-service `main.go` wires `mux.Handle("/metrics", promhttp.Handler())`. Phase 3's `prometheus.yml` already expects this — Phase 5 makes it stop returning 404.
- **D-17:** **Standard metric set** (helper in `pkg/observability/metrics.go`):
  - `http_request_duration_seconds{method, route, status}` — histogram, buckets `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]` (P50/P95/P99 derivable)
  - `http_requests_total{method, route, status}` — counter (error rate derivable as `rate(...status="5xx")[5m] / rate(...)[5m]`)
  - `jwt_validation_total{result="ok|expired|invalid|missing"}` — counter (OBS-05 dashboard target)
  - `nats_consumer_pending{stream, consumer}` — gauge (queue-depth — OBS-05 dashboard target; messaging + realtime-gw + notifications scrape NATS API)
  - `db_query_duration_seconds{operation}` — histogram (per-service DB lib instrumentation)
  - `external_api_duration_seconds{provider="mapbox|strava|expo_push"}` — histogram
- **D-18:** **Cardinality budget (OBS-07):** **NO `user_id` label on any metric.** Forbidden label names: `user_id`, `session_id`, `device_id`, `external_uuid`, `email`, `phone`. Allowed bucketed labels: `user_cohort` (≤10 cohort buckets), `route` (≤50 routes per service), `method` (5 verbs), `status` (5 status classes: 2xx/3xx/4xx/5xx/other), `provider` (≤10 third-party providers). Enforced via:
  - **Code review** + `pkg/observability/metrics.go` does NOT export label-with-user_id helpers
  - **CI gate** (`pii-audit.yml`): grep `MetricVec.*WithLabelValues.*user_id` blocks merge
  - **Runtime probe:** Plan 05-04 Task X scripts `prometheus_label_cardinality.py` that queries `/metrics` endpoint of each service + counts unique label combos per metric — fails if >1000 series per metric (per-service threshold).
- **D-19:** **Middleware wiring:** `pkg/observability/promhttp.go` exposes `Middleware()` func that wraps `http.Handler` + records duration + status + count. Each service's handler chain в `main.go`:
  ```go
  // Wave 2 wiring
  mux.Handle("/metrics", promhttp.Handler())
  // Wave 4 — promhttp.Middleware wraps existing handler
  rootHandler := observability.PromhttpMiddleware(serviceName, mux)
  ```

### Tracing — OpenTelemetry OTLP к Sentry (Prom+OTLP per ROADMAP §Phase 5 Goal)

- **D-20:** **OpenTelemetry SDK** (`go.opentelemetry.io/otel`) + OTLP/HTTP exporter (`go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp`) shipping к Sentry's built-in OTLP receiver (Sentry self-hosted >= v24.x has native OTLP HTTP ingest на `/api/<project-id>/envelope/`). NOT `OTLP/gRPC` (would require HTTP/2 cleartext или separate TLS port; HTTP simplest).
- **D-21:** **Trace attribute deny-list mirrors log deny-list (D-12).** Custom `TracerProvider` wrapper with `SpanProcessor` that strips banned attributes from spans before export. Reuses `pkg/observability/pii_deny_list.go` (single source of truth). Sentry's UI surfaces span attributes — leaking PII в spans is just as bad as logs.

### Tester-mode debug logging (OBS-08 — backend side)

- **D-22:** **Header-gated debug elevation** — `X-Debug-Session: 1` HTTP header (set by mobile-side toggle) — backend middleware in `pkg/observability/debug_session.go`:
  1. Reads `X-Debug-Session` header
  2. Checks featureflag `tester_debug_logs` за this `user_id` (via `pkg/featureflags`). Default OFF.
  3. If both true: sets `slog.LevelDebug` для this request's context (per-request override; doesn't affect server-wide level).
  4. Returns immediately to `LevelInfo` after request completes.
- **D-23:** **Mobile-side Settings toggle UI + RU consent banner = Phase 17 scope.** Phase 5 provides only the backend seam; mobile wiring + consent UX in Phase 17 (alongside mobile Sentry SDK install). Featureflag `tester_debug_logs` ships in Phase 5 (admin-controlled rollout via Phase 1's `pkg/featureflags` admin UI).

### Alerting — Telegram bot (2-dev team scale)

- **D-24:** **Alert routing к Telegram bot webhook** (NOT PagerDuty / NOT SMS). Rationale:
  - PagerDuty: ~$20/user/mo × 2 = $40/mo — overkill for closed-beta scale
  - SMS via Twilio: per-message fees + carrier delivery uncertainty
  - **Telegram bot:** free, instant push к both devs' phones, scriptable via BotFather + chat webhook. Single shared chat (`@running-ecosystem-alerts`) receives all Sentry + Grafana alerts.
- **D-25:** **Alert sources:**
  - **Sentry alerts** → Telegram webhook (via Sentry built-in Notification Integration → "Generic Webhook" → custom transformer Lambda OR direct к Telegram Bot API once `t.me/<bot>/sendMessage` URL constructed).
  - **Grafana alerts** → same Telegram webhook (Grafana supports Telegram contact point natively).
- **D-26:** **Alert rule scope (v1.0 closed beta — keep noise-floor low):**
  - **Critical (immediate Telegram):** any 5xx rate >5% over 5 min; JWT validation failure spike (>20/min); Sentry P0 event (unhandled panic); NATS consumer-lag >1000 msgs.
  - **Warning (Telegram, batched hourly digest):** P99 latency >2× baseline; db_query_duration_seconds P99 >500ms; external API error rate (mapbox/strava) >10%.
  - **No paging at night (00:00–07:00 MSK) для warnings** — only criticals page at any hour.
  - PagerDuty integration scaffolded as deferred (v1.1 if team grows).

### Log aggregation — Loki on sentry VPS (not on prod VPS)

- **D-27:** **Loki on sentry VPS, promtail on prod VPS shipping container stdout** к `https://sentry.<sentry-ip>.sslip.io:3100/loki/api/v1/push`. Single-tenant Loki (auth disabled per existing `loki.yml`); UFW restricts source IP к prod VPS only (D-28). 30-day retention (configurable).
- **D-28:** **Loki UFW allowlist** — sentry VPS UFW rule `allow 3100/tcp from <prod-vps-ip>/32`. No other source can push logs. Public access к Grafana (read-only viewer на logs) goes through Caddy reverse-proxy on `grafana.<sentry-ip>.sslip.io` с basic auth.
- **D-29:** **Promtail on prod VPS:** new role `infra/ansible/roles/promtail-shipper/` — installs `promtail` binary, configures `promtail-config.yml` (scrapes Docker container stdout via `/var/lib/docker/containers/*/`), ships к Loki on sentry VPS. systemd unit (NOT containerized — keeps log ship-out independent of `sport-stack.service` health; если sport-stack crashes, promtail still ships its dying logs).

### Sentry deploy seam (NEW role `sentry-prep`)

- **D-30:** **`infra/ansible/roles/sentry-prep/` structure:**
  - `tasks/main.yml`:
    1. git-clone `https://github.com/getsentry/self-hosted.git` к `/opt/sentry/` (pin `--branch <stable-tag>` per D-02)
    2. Template `/opt/sentry/.env` from SOPS-decrypted `SENTRY_ADMIN_PASSWORD` (decrypt-via-`delegate_to: localhost` pattern per Phase 3 D-12)
    3. First-run: `./install.sh --skip-user-prompt --no-report-self-hosted-issues` (idempotent — exits early if generated compose exists)
    4. `docker compose -f /opt/sentry/docker-compose.yml up -d`
    5. Create 4 projects via Sentry CLI: `sentry-cli projects create prod-backend / staging-backend / prod-mobile / staging-mobile` (or HTTP API equivalent)
    6. Extract DSNs + populate placeholders in SOPS (USER ACTION: после first install, copy 4 DSNs from Sentry UI → `sops edit .secrets/{prod,staging}/sentry.yaml`)
- **D-31:** **Sentry stack lifecycle separate from `sport-stack.service`.** New systemd unit `sentry-stack.service` on sentry VPS — `ExecStart=/usr/bin/docker compose -f /opt/sentry/docker-compose.yml up`. Mirrors Phase 3 D-04 pattern but bound к sentry VPS only. NEVER deployed к prod VPS (defeats isolation).

### Backend service integration (per-service main.go changes)

- **D-32:** **Each of 8 services' `main.go` gets** (post Plan 05-03 / 05-04 / 05-05):
  ```go
  // pkg/observability bootstrap
  logger := observability.NewSlogJSONHandler(observability.Config{
      ServiceName: "identity",
      Env:         env.Get("ENV", "prod"),
      Version:     versionLDFlag,
      Level:       observability.ParseLevel(env.Get("LOG_LEVEL", "info")),
  })
  slog.SetDefault(logger)

  // OTLP traces к Sentry
  tracerShutdown := observability.MustInitTracer(ctx, observability.TracerConfig{
      ServiceName: "identity",
      OtlpEndpoint: env.Get("SENTRY_OTLP_ENDPOINT", ""),  // e.g., sentry.<ip>.sslip.io
      SentryDSN: env.Get("SENTRY_DSN_BACKEND", ""),
  })
  defer tracerShutdown(ctx)

  // Sentry SDK для panic recovery + non-trace events
  observability.MustInitSentry(observability.SentryConfig{
      DSN: env.Get("SENTRY_DSN_BACKEND", ""),
      Env: env.Get("ENV", "prod"),
      Release: versionLDFlag,
      SampleRate: 1.0,  // closed beta — capture everything
  })

  // Handler chain
  rootHandler := observability.PromhttpMiddleware(serviceName,
      observability.DebugSessionMiddleware(featureflagClient,
          observability.SentryRecoveryMiddleware(
              observability.OtelHTTPMiddleware(mux))))
  mux.Handle("/metrics", promhttp.Handler())  // not wrapped — internal-only scrape

  http.ListenAndServe(":"+port, rootHandler)
  ```
  Centralizes 6 cross-cutting middlewares + 3 init calls. **Single source of truth** для all 8 services.

</decisions>

<deferred>
## Deferred to Researcher (Plan 05-XX research-phase)

Open questions where research clarifies best-practice details:

1. **`getsentry/self-hosted` version pin** — confirm latest stable LTS-line tag as of 2026-05; verify OTLP HTTP receiver supports our use case (was added in v24.x; check breaking changes); recommend specific tag (e.g., `25.5.0`).
2. **Sentry CLI vs HTTP API for project bootstrap** — `sentry-cli projects create` requires `sentry-cli` binary; HTTP API requires admin token. Researcher picks simplest CI/Ansible-friendly path.
3. **OTLP exporter to Sentry — auth mechanism** — Sentry's OTLP receiver accepts DSN-derived auth header (`X-Sentry-Auth`) OR Bearer token? Confirm syntax + endpoint path.
4. **Caddy in front of Sentry's bundled nginx** — Sentry's `install.sh` generates compose с nginx bound к 80/443. Two options: (a) override nginx port в compose + put Caddy in front (handles ACME); (b) configure Sentry's nginx for Let's Encrypt directly. Researcher picks per least-friction.
5. **Telegram alert webhook formatter** — Sentry "Generic Webhook" sends raw event JSON; Telegram Bot API expects `{chat_id, text}`. Need a transformer: (a) small `pkg/alerter` Go service на sentry VPS, (b) inline Sentry webhook template syntax (Sentry supports {{...}} substitution в webhook URL/body), (c) external aaS like webhook.site. Researcher recommends.
6. **Promtail vs Vector vs Fluent Bit для log shipping** — promtail = Loki's native shipper; Vector = Datadog's; Fluent Bit = CNCF's. All work. Researcher confirms promtail is simplest для our scale.
7. **Cardinality probe script implementation** — Python (existing smoke pattern) vs Go (matches service codebase) — confirm parsing approach для `text/plain` Prometheus exposition format.
8. **`X-Debug-Session` header gating + JWT claim coupling** — should we additionally require a JWT claim (e.g., `is_tester=true`) so the header doesn't grant debug logs к anonymous attackers? Researcher confirms threat model.
9. **`SENTRY_DSN_BACKEND` env var injection** — per-service vs shared. Currently SOPS `.secrets/prod/shared.yaml` mode would put one DSN shared by all 8 services (events tagged by `service` attribute). Alternative: 8 separate Sentry projects (`identity-prod`, `feed-prod`, ...) — more isolated but 4x dashboard surface. Researcher picks (lean: 1 prod-backend project, services tagged via `setTag("service", ...)`).
10. **Sentry retention configuration** — Sentry self-hosted retains events 90 days default. Confirm storage budget on 80 GB SSD (event volume estimate 10-50/day in closed beta = trivial); document tuning knobs.

</deferred>

<deferred_ideas>
## Out-of-Scope Ideas (Captured for Roadmap Backlog / future phases)

From analysis surfaced but не Phase 5 scope:

- **Mobile Sentry SDK install** — Phase 17 (CRASH-01..06). DSNs land here; consumer side lands там.
- **Real `<brand>.com` domain** — v1.1; both `sentry.<brand>.com` + `grafana.<brand>.com` migrate then.
- **PagerDuty integration** — v1.1 if team grows >2 devs.
- **Sentry user feedback widget** (in-app crash report comment from end user) — Phase 17 если product wants it.
- **Distributed tracing across mobile↔backend** — currently backend-only OTLP. Phase 17 wires mobile-side OTEL SDK = full client-to-server trace. v1.0 closed beta доesn't require client traces.
- **Profile-mode SDK** (Sentry Continuous Profiling) — adds ~5% CPU overhead per service; defer к v1.1 when load patterns established.
- **Per-tenant Sentry projects** (one per beta tester для isolation) — premature; 4 projects (env × platform) suffice для v1.0.
- **Sentry releases integration с Phase 4 cosign-signed tags** — Phase 17 ties `sentry-cli releases new <tag>` к release tag CI step.
- **Loki log-based alerting** (e.g., "if 10 ERROR logs/min from `identity`, page") — Grafana supports it; defer к after Phase 8 baselines establish normal volume.
- **Cardinality auto-throttle** (drop highest-cardinality metrics when scrape overhead spikes) — premature; manual cardinality probe + code review suffice.
- **Sentry SAML SSO** — solo dev / 2-dev team — admin user via Sentry built-in auth fine until v1.1.
- **External-monitoring smoke test** (synthetic uptime probe → Sentry если down) — v1.1 with Uptime-Kuma OR Pingdom-like.
- **Anomaly-detection alerts** (Prom recording rules + Grafana Forecast plugin) — premature; manual rule tuning fine until baselines exist (Phase 8).
- **Cost monitoring dashboard** (track Sentry event-volume vs SaaS-equivalent cost) — informational; pure self-hosted = fixed cost, irrelevant.

</deferred_ideas>

<canonical_refs>
## Canonical Documents (MUST READ before plan/research)

| Path                                                                  | Why it matters                                                                                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `.planning/ROADMAP.md §Phase 5`                                       | Phase 5 goal, success criteria 1-8, OBS-01..08 mapping, isolation redline                                                                 |
| `.planning/REQUIREMENTS.md §OBS-01..08`                               | Numbered requirement definitions; OBS-04 ties к CONCERNS.md P0 OTP-log                                                                    |
| `.planning/codebase/CONCERNS.md §"IDENTITY_DEV_MODE warning logs OTP code field" `      | The MEDIUM concern OBS-04 closes; specific file + line + fix approach                                                                     |
| `.planning/phases/03-infrastructure-as-code/03-CONTEXT.md`            | Phase 3 D-XX decisions Phase 5 inherits (Ansible structure, SOPS-decrypt seam, UFW patterns, sslip.io DNS, provider-agnostic VPS sourcing)|
| `.planning/phases/03-infrastructure-as-code/03-03-SUMMARY.md`         | Phase 3 closure + 7 carry-forward TODOs; deploy.md provider-agnostic shape Phase 5 extends                                                |
| `.planning/phases/04-ci-cd-pipeline/04-CONTEXT.md`                    | Phase 4 CI workflow architecture; Phase 5 adds grep-audit + cardinality probe jobs к the matrix                                           |
| `.planning/phases/04-ci-cd-pipeline/04-06-SUMMARY.md`                 | Deployment freeze procedure; Phase 5 introduces sentry-stack.service which inherits freeze patterns                                       |
| `docs/RUNBOOKS/deploy.md §1 Dev workstation setup`                    | SOPS_AGE_KEY_FILE setup; Phase 5 adds reference к new `.secrets/{prod,staging}/sentry.yaml` slot                                          |
| `docs/RUNBOOKS/deploy.md §5 Routine deploy`                           | Manual `ansible-playbook` flow; Phase 5 adds second inventory target (`inventory/sentry/`) reusing same seam                              |
| `docs/RUNBOOKS/deploy.md §6 Rollback`                                 | Phase 4 rollback procedure; Phase 5 introduces sentry-stack rollback (separate from sport-stack — same Make-target pattern but new file) |
| `docs/RUNBOOKS/sops-edit.md`                                          | SOPS edit + Mapbox rotation pattern; Phase 5 reuses pattern for sentry.yaml secrets (DSN, admin password, Telegram token)                 |
| `services/backend/observability/prometheus.yml`                       | Pre-existing scrape config; Phase 5's `/metrics` impl makes services stop returning 404                                                   |
| `services/backend/observability/loki.yml`                             | Pre-existing Loki config; Phase 5 productionizes (deploys к sentry VPS, не dev profile)                                                   |
| `services/backend/observability/grafana-datasources.yml`              | Pre-existing Grafana datasources; Phase 5 ships dashboards on top                                                                         |
| `services/backend/docker-compose.observability.yml`                   | Pre-existing local-dev observability compose; Phase 5 references but does NOT modify (dev workflow preserved)                             |
| `services/backend/identity/internal/service/otp.go:70-74`             | OBS-04 fix target — OTP `code` field unconditionally logged                                                                                |
| `services/backend/identity/internal/service/otp.go:111`               | Existing devMode-only log path (`slog.WarnContext`) — confirms `if devMode { ... }` pattern is precedent                                  |
| `services/backend/pkg/featureflags/` (Phase 1 REL-03)                 | Existing featureflag store; Phase 5 adds `tester_debug_logs` flag                                                                          |
| `services/backend/pkg/clientversion/` (Phase 1 REL-02)                | Existing middleware pattern Phase 5 mirrors для observability middlewares                                                                  |
| `apps/mobile-rn/src/observability/` (not yet created)                 | Phase 17 territory; Phase 5 creates 4 Sentry projects + DSNs ready for Phase 17 consumption                                               |
| ADR scheduled (number TBD by planner)                                 | Phase 5's observability-architecture ADR (Sentry self-host topology + slog choice + OTLP к Sentry + Telegram alerting)                    |

</canonical_refs>

<code_context>
## Reusable Assets

- **`services/backend/observability/` configs** (`prometheus.yml` + `loki.yml` + `grafana-datasources.yml`) — already templated за `re_prometheus` / `re_loki` / `re_grafana` containers в local dev. Phase 5 lifts these к sentry VPS deployment + updates source IPs:
  - `prometheus.yml` scrape targets change from `host.docker.internal:<port>` (dev) к `<prod-vps-ip>:<port>` (prod) — needs Jinja2 templating
  - `loki.yml` stays на sentry VPS, accepts promtail pushes from prod VPS
  - `grafana-datasources.yml` Prom + Loki URLs change к sentry-local-network
- **`services/backend/docker-compose.observability.yml`** stays as dev-profile compose (untouched); Phase 5's sentry VPS uses Sentry's own generated compose (`getsentry/self-hosted/install.sh` output) + adds Caddy + promtail-receiver in front.
- **`slog` (Go stdlib) — 81 call-sites across 8 services** confirm the logging library choice; Phase 5 swaps default `slog.Handler` to JSON-with-PII-scrub. No per-call-site changes needed except for D-13 OTP fix (1 call-site).
- **`services/backend/identity/internal/service/otp.go:111 + 124`** — existing `slog.WarnContext(...)` calls already gated behind `if devMode` block, proving the precedent для D-13 fix.
- **`services/backend/pkg/featureflags/`** (Phase 1 REL-03) — Phase 5 adds `tester_debug_logs` flag в the existing store; mobile + admin UI consumption уже scaffolded.
- **`infra/ansible/roles/{common,docker,ufw,sport-stack}/`** (Phase 3) — `common` + `docker` + `ufw` reused verbatim для sentry VPS (no fork); `sport-stack` role NOT used on sentry VPS; new `sentry-prep` role + new `promtail-shipper` role (deployed on prod VPS, not sentry VPS).
- **`.secrets/{prod,staging,dev}/{shared,mapbox,oauth}.yaml`** SOPS slots (Phase 2) — Phase 5 adds `sentry.yaml` slot at the same paths. Existing sops-edit RUNBOOK applies as-is.
- **`pkg/clientversion/middleware.go`** (Phase 1 REL-02) — pattern для chained middleware; Phase 5's 5 new middlewares (Promhttp, OtelHTTP, DebugSession, SentryRecovery, slog-context) follow the same shape.
- **`scripts/smoke_*.py`** (Phase 2/3/4) — pattern для acceptance smoke tests; Phase 5 adds:
  - `scripts/smoke_sentry.py` — POST synthetic exception к Sentry DSN, verify event visible in Sentry UI <30s
  - `scripts/cardinality_probe.py` — scrape each service's `/metrics`, count label combos, fail if >1000 series/metric
  - `scripts/pii_audit.sh` — bash equivalent of CI grep-audit для local pre-commit

## New Files Expected (per ROADMAP success criteria + D-XX decisions)

```
infra/
  ansible/
    inventory/
      sentry/hosts.yml                  # NEW — sentry VPS inventory group (re-introduces what Phase 3 D-23 dropped)
    group_vars/
      sentry.yml                        # NEW — sentry VPS group vars (caddy_host, sentry_admin_email)
    roles/
      sentry-prep/                      # NEW — Sentry self-hosted install + project bootstrap
        tasks/main.yml
        templates/.env.j2
        templates/caddy.j2
      promtail-shipper/                 # NEW — deployed ON prod VPS (not sentry); ships container stdout к Loki
        tasks/main.yml
        templates/promtail-config.yml.j2
    site.yml                            # MODIFY — add sentry play + promtail play, group-gated
services/backend/
  pkg/observability/                    # NEW package — single source of truth для cross-cutting middleware
    slog_handler.go                     # NEW — JSON output + PII deny-list scrub + email-hash + default attrs
    pii_deny_list.go                    # NEW — shared deny-list для slog AND OTel spans
    promhttp_middleware.go              # NEW — HTTP request duration/count/status histogram + counter
    debug_session_middleware.go         # NEW — X-Debug-Session header parser + featureflag check + per-request level override
    sentry_init.go                      # NEW — sentry-go SDK init + recovery middleware
    otel_init.go                        # NEW — OTel SDK init + OTLP/HTTP exporter к Sentry + span-attr PII scrub
    metrics.go                          # NEW — standard metric definitions (http_*, jwt_*, nats_*, db_*, external_api_*)
  <each service>/cmd/server/main.go     # MODIFY — bootstrap observability per D-32 pattern
  identity/internal/service/otp.go      # MODIFY — D-13 fix (OTP code line 70-74)
.secrets/
  prod/
    sentry.yaml                         # NEW SOPS slot — DSNs (backend + mobile), admin password, Telegram bot creds
  staging/
    sentry.yaml                         # NEW (placeholder; populated when staging lands в v1.1)
.github/
  workflows/
    backend-ci.yml                      # MODIFY — add pii-audit job + cardinality-probe job (post-build)
    sentry-deploy.yml                   # NEW (optional) — separate workflow if sentry-VPS Ansible play needs special secrets / shorter timeouts
docs/
  RUNBOOKS/
    deploy.md                           # MODIFY — add §11 sentry-stack deploy, §12 sentry rollback, reference new SOPS slot
    sentry-ops.md                       # NEW — Sentry admin user creation + project bootstrap + Telegram bot setup + retention tuning + backup procedure
    observability.md                    # NEW — slog usage conventions, metric naming, PII deny-list reference, cardinality budget
  DECISIONS/
    0009-observability-architecture.md  # NEW ADR — Sentry self-host + separate VPS + slog choice + OTLP к Sentry + Telegram alerting + isolation redline
  TELEMETRY.md                          # NEW — opt-in telemetry event allowlist (Phase 17 consumes; Phase 5 ships skeleton)
services/backend/observability/
  prometheus.yml                        # MODIFY — Jinja2 template (prod scrape targets via group_vars)
  dashboards/                           # NEW dir — Grafana dashboard JSON definitions (P99 latency, error rate, queue depth, JWT failures)
    backend-overview.json
    nats-jetstream.json
    db-performance.json
services/backend/scripts/
  smoke_sentry.py                       # NEW — Sentry event smoke test
  cardinality_probe.py                  # NEW — Prom label cardinality verifier
  pii_audit.sh                          # NEW — local pre-commit grep-audit helper
```

## Pitfalls to Avoid (Pre-Researcher Heads-Up)

1. **Don't colocate Sentry с app VPS — user redline.** Even "just для closed-beta savings" violates the isolation gate. Sentry на separate VPS, full stop.
2. **Don't put `code` attribute back into `slog.InfoContext` even в dev** — defense-in-depth means handler also scrubs; if engineer adds back at call-site, CI grep-audit gate blocks PR.
3. **Don't add `user_id` label on metrics — even "just one"** — Prom cardinality explosion is super-linear. Use `user_cohort` (≤10 buckets). Cardinality probe in CI catches accidental additions.
4. **Don't expose Sentry instance к the public Internet за Prom / Loki HTTP push endpoints (3100, 9090)** — UFW allowlist source IP к prod VPS only. Sentry web UI at 443 stays public (CDN-cacheable static assets + DSN-auth для events).
5. **Don't ship logs OR metrics с PII labels к Sentry / Prom / Loki and hope to redact server-side** — pre-emit scrubbing (slog.Handler + span processor) is the only reliable seam. Server-side redaction is unreliable when log volume spikes.
6. **Don't add per-`route` labels с unbounded route paths** (e.g., `/users/123/sessions/456`) — use templated route names from mux (`/users/{id}/sessions/{session_id}`). Prom `WithLabelValues` panics on unbounded cardinality.
7. **Don't run `install.sh` twice — it regenerates compose file + can lose admin user state.** Make `sentry-prep` Ansible role idempotent с `creates:` check (e.g., `creates: /opt/sentry/docker-compose.yml`).
8. **Don't push к Telegram bot from Sentry directly without rate-limit** — Sentry incident storm = 100s of alerts/sec — Telegram rate-limits (30 msg/sec). Add small alerter service OR Grafana batch-alerting feature.
9. **Don't expose `SENTRY_ADMIN_PASSWORD` к the app via shared env** — it lives только on sentry VPS / sentry.yaml. App services получают только DSN.
10. **Don't put OTel tracing in synchronous critical path без span sampling** — 100% sampling fine для v1.0 closed-beta scale (<100 RPS); set `TracesSampleRate=0.1` for v1.1 if event volume crosses threshold.
11. **Don't forget to wire OBS-06 to mobile too** — Phase 5 covers backend log redaction; mobile-side redaction (DM content, GPS coords в Sentry breadcrumbs) lives в Phase 17 (`apps/mobile-rn/src/observability/sentry.ts` per CRASH-02). Don't claim "OBS-06 closed" until both sides done — flag in Phase 5 closeout SUMMARY.

</code_context>

<dependencies>
## Plan-Level Dependencies (Within Phase 5)

Expected plan breakdown (refined в `/gsd-plan-phase 5` after research; 6 plans across 4 waves):

- **Wave 1 (sequential — blocks everything):**
  - **`05-01`** — **Sentry VPS provisioning + sentry-prep Ansible role + DNS** (OBS-01). USER ACTION CHECKPOINT 1: pick VPS provider + create new VPS + share IP. Ansible: reuse `common` + `docker` + `ufw` roles + add `sentry/` inventory group + new `sentry-prep` role + Caddy на sentry VPS с ACME для `sentry.<sentry-ip>.sslip.io`. autonomous=false (USER ACTION first task).

- **Wave 2 (parallel after Wave 1):**
  - **`05-02`** — **Sentry self-hosted install + 4 projects + Telegram alert webhook** (OBS-01, OBS-02). USER ACTION CHECKPOINT 2: BotFather creates `@running-ecosystem-alerts-bot`, user supplies token + chat ID. Ansible runs `install.sh` + creates 4 projects + extracts DSNs. USER ACTION 3: copy DSNs к SOPS (или automation если sentry-cli wraps it). Telegram webhook configured for prod-backend project. autonomous=false (USER ACTIONS dominate).
  - **`05-03`** — **Structured slog JSON handler + PII deny-list + OBS-04 OTP fix + CI grep-audit** (OBS-03, OBS-04, OBS-06). Create `pkg/observability/slog_handler.go` + `pii_deny_list.go`; wire в each of 8 services' `main.go`; fix `otp.go:70-74`; add `pii-audit.yml` GH Action или extend `backend-ci.yml`. autonomous=true (no USER ACTION; tests cover behavior).

- **Wave 3 (parallel after Wave 2):**
  - **`05-04`** — **Prometheus client_golang `/metrics` + middleware + Grafana dashboards + cardinality probe** (OBS-05, OBS-07). Add `pkg/observability/promhttp_middleware.go` + `metrics.go` standard set; wire в 8 services; ship 3 Grafana dashboard JSONs; add `cardinality_probe.py` smoke + CI gate. autonomous=true.
  - **`05-05`** — **OpenTelemetry OTLP traces к Sentry + sentry-go SDK init** (Prom+OTLP per ROADMAP; ties OBS-01 production usage). Add `otel_init.go` + `sentry_init.go` + span-attr PII scrub processor; wire в 8 services. autonomous=true.

- **Wave 4 (sequential after Wave 3):**
  - **`05-06`** — **Promtail log shipping + tester-debug session header + final acceptance** (OBS-06 closure + OBS-08 backend half). Ansible: `promtail-shipper` role на prod VPS shipping к Loki on sentry VPS. Backend: `debug_session_middleware.go` + featureflag `tester_debug_logs` registration. Final acceptance: grep audit clean + cardinality probe green + `smoke_sentry.py` green + sample-runtime inspection. Documents everything в `docs/RUNBOOKS/sentry-ops.md` + `docs/RUNBOOKS/observability.md` + ADR-0009. autonomous=false (final acceptance walkthrough needs USER confirm).

**Cross-cutting constraints (truths shared by 2+ plans):**

- All cross-cutting middleware lives in single package `pkg/observability/` — no per-service forks
- PII deny-list (D-12) is single source of truth (Go file imported by slog handler AND OTel span processor)
- SOPS slot `sentry.yaml` populated в Plan 05-02 USER ACTION; consumed by all subsequent waves
- Caddy on sentry VPS handles ACME для `sentry.<ip>.sslip.io` independently from app's Caddy на `148-253-214-156.sslip.io` (separate certs, separate rate-limit budget)
- Sentry stack lifecycle (`sentry-stack.service`) is independent of `sport-stack.service` — they're on different VPSes

</dependencies>

<success_criteria>
## Phase 5 Acceptance (from ROADMAP, no expansion — 8 criteria)

1. ✓ Sentry self-hosted instance running on separate VPS at `sentry.<sentry-ip>.sslip.io` с separate ACME cert (D-01, D-02, D-03, D-04, D-30, D-31)
2. ✓ 4 Sentry projects scoped: `staging-mobile`, `prod-mobile`, `staging-backend`, `prod-backend` (D-06; mobile projects consumed in Phase 17)
3. ✓ Structured JSON logs via `slog` on all 8 Go services с level + service + env + version + request_id default attrs; **OTP codes never logged in prod path** (D-09, D-10, D-13, D-14)
4. ✓ Prom `/metrics` exposed on each service; Grafana dashboards for P99 latency, error rate, queue depth, JWT-validation failures (D-15, D-16, D-17, D-19)
5. ✓ **No GPS coordinates ever in logs.** No phone numbers. No `displayName`. No DM content. No `external_uuid`. Verified via CI grep audit + runtime sample inspection (D-12, D-14, smoke_sentry.py, Plan 05-06 acceptance walkthrough)
6. ✓ Cardinality budget: no per-`user_id` labels on metrics (use bucketed cohorts). Verified via `cardinality_probe.py` Prom label-cardinality probe (D-18)
7. ✓ Tester-mode debug logging opt-in per session via Settings toggle с explicit RU consent banner — **backend seam ready (D-22, D-23); mobile UX = Phase 17**. Phase 5 closeout SUMMARY flags this split.
8. ✓ Alert rules с on-call thresholds wired к Telegram bot webhook (replacing PagerDuty / SMS escalation per D-24, D-25, D-26)

</success_criteria>

<user_checkpoints>
## Anticipated User-Action Checkpoints

Phase 5 has 3 `autonomous: false` checkpoints:

1. **Plan 05-01 Task 0 — Sentry VPS provisioning** (Wave 1): User picks VPS provider (recommended: same as prod-vps for billing simplicity), spins up Ubuntu 24.04 LTS с 4 vCPU + 16 GB RAM + 80 GB SSD (~€20/mo Hetzner CCX23 equivalent), shares public IP. Ansible inventory's `sentry/hosts.yml` uses this IP. Same SSH-key bootstrap pattern as Phase 3 (D-19 hardening applies).
2. **Plan 05-02 Task X — Telegram bot creation + DSN extraction** (Wave 2): User talks к `@BotFather` on Telegram, creates `@running-ecosystem-alerts-bot`, supplies token + chat ID. After Sentry install.sh runs + creates 4 projects, user copies the 4 DSNs from Sentry UI к `sops edit .secrets/{prod,staging}/sentry.yaml` slots. Researcher may automate DSN extraction via sentry-cli — if so, this checkpoint shrinks к "verify SOPS slot populated".
3. **Plan 05-06 Task X — Final observability acceptance walkthrough** (Wave 4): User confirms Sentry UI accessible, P99 dashboard populates, sample log event reviewed for PII redaction correctness, Telegram alert test fires + receives. Documents в SUMMARY + flips ROADMAP §Phase 5 checkbox.

**(Optional) Phase 2 secret rotation trigger** (carry-forward, recommended но не Phase 5 critical-path): rotate POSTGRES_PASSWORD + JWT_SECRET + MINIO_ROOT_* before Phase 21 staging soak. Can happen в parallel с Phase 5 OR deferred к Phase 21 prep. **Phase 5 introduces NEW secrets** (Sentry DSN, admin password, Telegram bot creds) — those must be generated offline + `sops --set` directly, NOT pasted в chat (matches Phase 2 SEC-02 discipline + avoids adding к Phase 2 backlog of compromised secrets).

</user_checkpoints>

---

*Phase: 05-observability-backend*
*Context gathered: 2026-05-18 (autonomous mode)*
*Next: `/gsd-plan-phase 5` (research recommended — D-XX cite 10 deferred questions для researcher)*
