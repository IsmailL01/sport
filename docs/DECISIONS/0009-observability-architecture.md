# ADR-0009: Observability Architecture

**Дата:** 2026-05-20
**Статус:** Accepted
**Контекст:** Phase 5 / OBS-01..08 (милестон v1.0 Production Readiness)
**Решение:** одностраничный roll-up восьми tightly-coupled sub-decisions — Sentry deployment topology, slog choice, OTLP-to-Sentry tracing, Telegram alerting, single shared project + per-service tag, Loki log shipping via Alloy, tester-mode debug seam, и acceptance-walkthrough policy.

## Контекст

Phase 5 — это **backend observability hardening**. Цель: backend services производят structured JSON logs + Prometheus metrics + OTLP traces — observable enough для диагностики production incidents, restricted enough чтобы GPS coordinates, phone numbers, DM content и любая другая PII никогда не появлялись в логах / трейсах / Sentry events. Параллельно: minimal-friction Telegram alerting на critical thresholds.

В ходе Phase 5 архитектура претерпела **2 amendments** (per ADR-0010 + ADR-0010 amendment 2026-05-19 PM). Они инвертировали изначальный план "Sentry self-hosted на отдельном VPS" → "Sentry SaaS dormant + Loki/Grafana/Prom колоцированы на srv1561293" → "Sentry SaaS activation deferred to post-v1.0; ship SDK substrate wired-and-dormant via D-38 empty-DSN guard". Этот ADR кодифицирует финальное v1.0 состояние.

Канонические требования:

- [.planning/REQUIREMENTS.md](../../.planning/REQUIREMENTS.md) §Phase 5 — Observability (OBS-01..08).
- [.planning/ROADMAP.md](../../.planning/ROADMAP.md) §Phase 5.
- [.planning/phases/05-observability-backend/05-CONTEXT.md](../../.planning/phases/05-observability-backend/05-CONTEXT.md) — D-XX decision log (D-01..D-38).
- [.planning/phases/05-observability-backend/05-RESEARCH.md](../../.planning/phases/05-observability-backend/05-RESEARCH.md) — Q1..Q10 resolutions + P12..P21 pitfalls.
- [docs/DECISIONS/0010-sentry-saas-and-colocation.md](0010-sentry-saas-and-colocation.md) — ADR-0010 + 2026-05-19 PM amendment (Sentry deferral).

## Решение

Восемь сильно связанных архитектурных sub-decision'ов зашиты в один ADR (per CONTEXT.md note — splitting в 0009/0010/0011 создал бы ADR sprawl при том, что разделы делят инфраструктуру и SOPS-секреты).

### §1 Sentry deployment topology — SaaS, dormant for v1.0

**Принято:** Sentry SaaS (sentry.io organization) — НЕ self-hosted. Активация **отложена post-v1.0** per ADR-0010 amendment 2026-05-19 PM. SDK code paths в `pkg/observability/{otel_init,sentry_init}.go` ship **wired-and-dormant** via D-38 empty-DSN guard:

```go
if cfg.DSN == "" {
    slog.Info("observability.sentry: disabled — empty DSN",
        "next_step", "see ADR-0010 amendment 2026-05-19 PM")
    return func() {} // no-op shutdown
}
```

Это **dormant-by-design path** для v1.0. Активация = SOPS edit для populate 4 DSN + redeploy (никаких code change'ей).

**Rationale (короткая):** изначальный self-hosted plan (D-01..D-05) был SUPERSEDED in ADR-0010 (2026-05-19 AM) — separate-VPS заявка вместе с Sentry's heavy Postgres + ClickHouse + Kafka + Snuba stack overshot small-team capacity. Затем (PM amendment): closed-beta scale + дев-команда 2 человека = "wired but inactive" даёт all-the-code-paths-tested benefit без operational overhead. **4 проекта в Sentry SaaS** (`prod-backend`, `staging-backend`, `prod-mobile`, `staging-mobile`) — RESEARCH §1.9 single-project tag-discriminated model: tag `service=identity|feed|...` + `env=prod|staging` discriminates 8×2 sources.

**Files:** `services/backend/pkg/observability/sentry_init.go`, `otel_init.go`. **Tests:** `TestMustInitSentry_EmptyDSN`, `TestMustInitTracer_EmptyDSN` — assert INFO log + `next_step` attr + no-op closure.

### §2 slog choice + PII deny-list

**Принято:** `log/slog` stdlib (Go 1.21+) — НЕ Zap, НЕ Logrus. JSON-handler на all 8 Go services с per-record default attrs (`service`, `env`, `version`, `request_id`) + email hashing + D-12 PII deny-list scrub.

**Rationale:** baseline grep `slog\.\w+Context\(` ловит 81 existing call site (Phase 2 / SEC-09 закрепил slog convention). Миграция на Zap = 81-touchpoint rewrite + dep add; slog уже works + structured. PII handling в **3 уровнях defense-in-depth**:
1. **Call-site discipline** (D-13 OTP fix — `if devMode { slog.Debug... }` gated).
2. **Handler scrub** (`pkg/observability/slog_handler.go.piiScrubHandler.Handle` walks attrs; drops `IsDenied(key)`, hashes `ShouldHash(key)` to `email_hash` via SHA-256-first-8-hex).
3. **CI grep audit** (`scripts/pii_audit.sh` + `pii-audit` GH Actions job + required-check branch protection — D-14).
4. **Runtime sample** (`scripts/pii_live_probe.py` queries Loki, regex-scans CONTENT — D-12 closure at line-level — Plan 05-06 Task 4).

**Source-of-truth:** `services/backend/pkg/observability/pii_deny_list.go` — `PIIDenyList map[string]struct{}` (29 D-12 keys) + `EmailHashKeys` + helpers (`IsDenied`, `ShouldHash`, `HashEmail`). **D-21 single source of truth** — same map drives slog handler + OTel span processor.

### §3 OTLP-to-Sentry tracing

**Принято:** OTLP/HTTP exporter к Sentry's SaaS endpoint (derived from `SENTRY_DSN_BACKEND` env). Per RESEARCH §1.3: `WithEndpoint(host)` + `WithURLPath("/api/<project_id>/otlp/v1/traces")` (SaaS path per ADR-0010 amendment — was `integration/otlp/v1/traces` для scrapped self-hosted target) + `WithHeaders({"X-Sentry-Auth": "sentry sentry_key=" + publicKey})` + gzip.

**SpanProcessor** wraps `sdktrace.NewBatchSpanProcessor(exporter)` с `piiScrubProcessor`, который reuses `PIIDenyList` + `EmailHashKeys` из §2 (D-21). На `OnStart`, walks `s.Attributes()` и overwrites:
- `IsDenied(key)` → value replaced with `"[redacted]"`
- `ShouldHash(key)` → value replaced with `HashEmail(value)` (key kept as-is)

**Documented limitation:** OTel's `ReadOnlySpan` на `OnEnd` не allows mutation; attributes added via `span.SetAttributes()` *после* `OnStart` bypass scrub. Mitigation = per-call-site discipline + future grep audit extension (Plan 05-06 carry-forward: extend `scripts/pii_audit.sh` для catch `span.SetAttributes` с PII keys).

**Pinned deps (RESEARCH §4):** `go.opentelemetry.io/otel v1.32.0`, `otel/sdk v1.32.0`, `otlptrace/otlptracehttp v1.32.0`, `otelhttp v0.57.0`. **Sample rate = 1.0** (RESEARCH §P15 closed-beta scale).

### §4 Telegram alerting

**Принято:** Grafana → Telegram contact point (native integration в Grafana Alerting / `alerting/contact-points.yml.template`). НЕ PagerDuty (cost + complexity для 2-dev team); НЕ SMS (eats budget на closed-beta scale); НЕ email (latency + noise floor).

**Contact point:** `telegram-alerts` → `@running_ecosystem_alerts_bot` / chat `8791445158` (from SOPS `.secrets/prod/sentry.yaml`).

**D-26 alert rules (6, codified в Grafana provisioning):**

| Rule UID | Severity | Condition |
|---|---|---|
| `5xx-rate-over-5pct` | critical | rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05 |
| `jwt-validation-failure-spike` | critical | rate(jwt_validation_total{result!="ok"}[1m]) > 0.333 (20/min) |
| `nats-consumer-lag-gt-1000` | critical | max(nats_consumer_pending) > 1000 |
| `http-p99-over-2x-baseline` | warning | histogram_quantile(0.99, ...[5m]) > 2 * histogram_quantile(0.99, ...[1h]) |
| `db-p99-over-500ms` | warning | histogram_quantile(0.99, db_query_duration_seconds_bucket[5m]) > 0.5 |
| `external-api-error-rate-over-10pct` | warning | rate(external_api_duration_seconds_count{status=~"err.*"}[5m]) > 0.10 |

**Routing:** criticals → Telegram immediately; warnings → Telegram с `night-mute-msk` silence applied. Rate-limit на bot side via Telegram's rate-limit (no token-bucket needed at this scale; revisit если 25 msg/sec threshold approached). PagerDuty migration path documented в §11 Pending follow-ups.

### §5 Single prod-backend project + per-service tag (RESEARCH §1.9)

**Принято:** 1 Sentry project (`prod-backend`) для всех 8 backend services + `setTag("service", svc)` + `setTag("env", envName)` per RESEARCH §1.9. НЕ 8 projects per service.

**Rationale:** разделение на 8 projects → 8× admin surface (8 retention configs, 8 alert routes, 8 dashboard sets) при том, что cross-service OTLP traces должны stay connected (single trace_id across identity → activity-sync → feed). Tag-based filtering preserves isolation без operational multiplication. **Tests:** `TestSentry_TagsSetCorrectly` validates `Tags["service"]` + `Tags["env"]` via mock-transport interceptor.

### §6 Log shipping via Grafana Alloy

**Принято:** Grafana Alloy (НЕ Promtail) — Promtail EOL 2026-03-02 per RESEARCH §1.6 / §P20. Pinned at v1.5.0 (RESEARCH §4). **Deployed via apt + systemd** на prod VPS, NOT containerized (D-29 — independence from `sport-stack.service`; если sport-stack рестартует, alloy continues shipping).

**Pipeline (RESEARCH §P21 — discovery.docker + loki.source.docker MUST be paired):**

```
discovery.docker "containers" → loki.source.docker "containers"
                              → loki.write to https://82-25-71-215.sslip.io:8443/loki/api/v1/push
                                (Caddy-fronted on srv1561293; @allowed_loki source-IP matcher)
```

**Loki label hygiene (RESEARCH §P16):** `labels = { env, cluster }` only. NEVER `request_id` (would explode stream cardinality); request_id stays INSIDE log JSON body, queried via LogQL `|= "request_id=<uuid>"`.

**TLS:** Caddy uses self-signed internal cert per D-37; Alloy `tls_config { insecure_skip_verify = true }`. Authentication = Caddy `@allowed_loki { remote_ip ... }` source-IP matcher (D-36) — TLS = transport security, NOT auth.

**Role:** `infra/ansible/roles/alloy-shipper/` (Plan 05-06 Task 3). **Site.yml:** new third play targeting `app_servers` with `tags=[alloy]`.

### §7 Tester-mode debug logging — backend seam only (D-22 / D-23)

**Принято:** `DebugSessionMiddleware` в `pkg/observability/debug_session_middleware.go` enforces D-22 **three-gate rule** per RESEARCH §1.8 — header alone is a debug-DoS vector:

1. `X-Debug-Session: 1` header present
2. JWT claim `IsTester == true` (verified in-place via `auth.Signer.VerifyAccess`)
3. Featureflag `tester_debug_logging` ON for that user

All three → ctx carries `slog.LevelDebug` via `WithLogLevel`; any missing → silent passthrough at `LevelInfo`. **NO slog emission on any gate** — pre-auth attacker spamming the header must NOT amplify log volume.

**Mobile-side UX (Settings toggle + RU consent banner) = Phase 17 territory.** v1.0 backend ships only the seam. Phase 17 inherits:
- Settings toggle that emits `X-Debug-Session: 1` for outbound requests
- RU consent banner ("Включить отладочные логи на эту сессию? Логи могут содержать диагностическую информацию...")
- Mobile-side `apps/mobile-rn/src/observability/sentry.ts` PII-strip middleware mirroring backend D-12 deny-list

**Chain placement (D-32):** OUTERMOST observability layer per-service main.go:

```
DebugSessionMiddleware (Plan 05-06)
  └─ PromhttpMiddleware (Plan 05-04)
       └─ SentryRecoveryMiddleware (Plan 05-05)
            └─ OtelHTTPMiddleware (Plan 05-05)
                 └─ clientversion.Middleware (Plan 01-02)
                      └─ mux (routes + /metrics)
```

### §8 Acceptance walkthrough policy

**Принято:** Phase 5 closure требует USER-EXECUTED runtime walkthrough (Plan 05-06 Task 6), NOT auto-pass criteria. 11 steps codified в `docs/RUNBOOKS/sentry-ops.md §Acceptance Walkthrough`. Steps 1, 2, 7 (Sentry SaaS surface) marked **DEFERRED per ADR-0010 amendment**; replacements assert D-38 dormant contract via boot log INFO line.

**Rationale:** observability stack is end-user-facing для on-call. Auto-assertions verify isolated components; only manual walkthrough catches cross-component integration regressions (Grafana panel data freshness, Telegram delivery latency, Caddy basicauth UX).

## Канонические требования

- [.planning/REQUIREMENTS.md](../../.planning/REQUIREMENTS.md) §Phase 5 — OBS-01..08
- [.planning/ROADMAP.md](../../.planning/ROADMAP.md) §Phase 5
- [.planning/phases/05-observability-backend/05-CONTEXT.md](../../.planning/phases/05-observability-backend/05-CONTEXT.md) — D-01..D-38 decision log
- [.planning/phases/05-observability-backend/05-RESEARCH.md](../../.planning/phases/05-observability-backend/05-RESEARCH.md) — Q1..Q10 + P12..P21
- [.planning/phases/05-observability-backend/05-VALIDATION.md](../../.planning/phases/05-observability-backend/05-VALIDATION.md) — verification matrix
- [docs/DECISIONS/0010-sentry-saas-and-colocation.md](0010-sentry-saas-and-colocation.md) — sister ADR (Sentry SaaS deferral + colocation)
- [docs/RUNBOOKS/sentry-ops.md](../RUNBOOKS/sentry-ops.md) — operational runbook (§Acceptance Walkthrough)
- [docs/RUNBOOKS/observability.md](../RUNBOOKS/observability.md) — engineer-facing reference (sibling RUNBOOK)

## Сценарии пересмотра

Этот ADR будет пересмотрен если:

1. **Sentry SaaS активирован post-v1.0.** §1 + §3 + §5 переключаются от "dormant" к "live". §4 может get augmentation: Sentry-side Telegram contact в дополнение к Grafana-side.
2. **2-dev team scales up.** §4 may add PagerDuty alongside Telegram (criticals only); §8 walkthrough may automate steps 4 + 8 via headless browser screenshots.
3. **Loki retention pressure.** §6 default `retention_period: 30d` revisit к 7d или 14d если srv1561293 disk usage >60%; RUNBOOK §13 documents the knob.
4. **Mobile SDK ships (Phase 17).** §7 expands: mobile-side `apps/mobile-rn/src/observability/` middleware mirrors backend D-12; new ADR-0011 documents mobile PII strip.
5. **Real domain replaces sslip.io (v1.1).** §6 + §8 carrier-swap; cert SAN updates automatically на Caddyfile change; Alloy `insecure_skip_verify` flag REMOVE.

---

*ADR создан: 2026-05-20 — Phase 5 / Plan 05-06 Task 5*
*Owner: solo dev (Ismail)*
