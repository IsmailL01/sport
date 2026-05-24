# Phase 5: Observability (backend) — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `05-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-18
**Phase:** 05-observability-backend
**Mode:** Autonomous (`--auto`-equivalent per persistent no-questions instruction; mirrors Phase 2/3/4 CONTEXT posture — see [feedback_autonomous_discuss_mode.md](../../../.claude/projects/-Users-ismail-Desktop-projects-sport/memory/feedback_autonomous_discuss_mode.md))
**Areas discussed:** Sentry topology, Logging library + structure, PII redaction strategy, Metrics library, Tracing transport, OTP code-leak fix, Alert routing, Log aggregation, Tester-mode debug logging, Sentry deploy seam, Sentry VPS sizing, DNS scheme, Sentry projects scaffolding, DSN management, Cardinality budget enforcement

---

## Sentry topology (OBS-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Sentry SaaS (sentry.io free tier) | No infra to manage; 5k events/mo free; data-residency concerns | |
| Colocate Sentry с app on prod VPS | Save €20/mo; one VPS to manage | |
| **Separate VPS for Sentry с separate DNS + separate Caddy + separate ACME cert** | Isolation per user redline; ~€20/mo additional cost; survives app outage | **✓ (D-01)** |
| Sentry-CDN / Snuba on different VPS, frontend on app VPS | Hybrid; complex to operate | |

**Auto-selected rationale:** ROADMAP §Phase 5 + user redline locks this upstream: "losing both app and crash reports during an incident is unacceptable". Not relitigated.

---

## Sentry self-hosted version + install path

| Option | Description | Selected |
|--------|-------------|----------|
| **`getsentry/self-hosted` + `./install.sh`** | Official; pinned compose; 30+ containers under one umbrella | **✓ (D-02)** |
| Helm chart (sentry-kubernetes/charts) | Requires K8s — not on roadmap (CLAUDE.md states v1.0 stays docker-on-VPS) | |
| Build from source | Maintenance burden; unjustified for 2-dev team | |
| Sentry-equivalent (GlitchTip) | Sentry-compatible, lighter; smaller community | |

**Auto-selected:** `getsentry/self-hosted` (canonical); researcher pins specific version tag.

---

## Sentry VPS sizing

| Option | Specs | Cost (~) | Selected |
|--------|-------|----------|----------|
| Minimum (Sentry-supported) | 2 vCPU + 8 GB RAM + 40 GB SSD | ~€8/mo | |
| **Recommended** | **4 vCPU + 16 GB RAM + 80 GB SSD** | **~€20/mo** | **✓ (D-03)** |
| Comfortable | 8 vCPU + 32 GB RAM + 160 GB SSD | ~€40/mo | |

**Auto-selected rationale:** Sentry's official docs flag OOM-kill при <8 GB RAM under default-feature stack (Kafka + ClickHouse + Postgres + Redis); 16 GB is the conservative floor for closed beta. Plan 05-01 includes a downsize-если-headroom-OK gate at 30 days post-launch.

---

## DNS scheme for sentry VPS

| Option | Pattern | Selected |
|--------|---------|----------|
| **sslip.io with own IP** | `sentry.<sentry-ip>.sslip.io` | **✓ (D-04, D-05)** |
| Real `<brand>.com` domain registered now | `sentry.<brand>.com` | |
| Reuse app's subdomain | `sentry.148-253-214-156.sslip.io` (defeats isolation) | |
| Subdomain wildcard via DNS provider | Adds DNS provider account dependency | |

**Auto-selected:** sslip.io reuse матches Phase 3 D-18 precedent; real domain deferred к v1.1 (same Phase 3 path).

---

## Sentry projects scaffolding (OBS-02)

| Option | Project count | Selected |
|--------|---------------|----------|
| **4 projects (env × platform):** prod-backend, staging-backend, prod-mobile, staging-mobile | 4 — zero cost on self-hosted; clean separation when staging lands | **✓ (D-06)** |
| 2 projects (prod-backend + prod-mobile), staging dropped | Smaller surface, но scrambles when staging lands | |
| 8 projects (per-service × env) | Higher isolation, 4× dashboard surface | |
| 1 project с tag separation | Simplest но defeats hard isolation rule | |

**Auto-selected:** 4 projects per OBS-02 exact text. Mobile projects empty в Phase 5 (DSNs created, consumer-side wired в Phase 17).

---

## Logging library (OBS-03)

| Option | Notes | Selected |
|--------|-------|----------|
| **`slog` (Go stdlib)** | Already в use на 81 call-sites; zero migration cost; stdlib = zero dep surface | **✓ (D-09)** |
| Zap (Uber) | Faster но <100 RPS scale negligible diff; requires migration | |
| zerolog | Similar к Zap; ditto | |
| Logrus | Slower; not recommended for new projects | |

**Auto-selected:** slog. ROADMAP §OBS-03 says "Zap or slog" — slog wins on incumbency.

---

## PII redaction strategy

| Option | Layer | Selected |
|--------|-------|----------|
| **Pre-emit via custom `slog.Handler` wrapper + grep audit в CI** | Single chokepoint в Go runtime + static-analysis gate | **✓ (D-10, D-12, D-14)** |
| Post-process in Loki/Grafana pipeline | Server-side regex strip; fragile under volume | |
| Per-call-site discipline только | Engineer must remember; no defense-in-depth | |
| Block via OPA policy на logging | Heavy-weight; overkill for stdlib-slog | |

**Auto-selected:** Pre-emit (D-10) с CI grep gate (D-14) provides defense-in-depth — engineer must add к BOTH PII deny-list AND call-site discipline.

**PII deny-list (D-12):** `code`, `otp_code`, `otp`, `phone`, `phone_number`, `displayName`, `name`, `external_uuid`, `strava_external_id`, `lat`, `lon`, `latitude`, `longitude`, `coords`, `gps`, `location`, `dm_content`, `message_body`, `body`, `content`, `mapbox_token`, `strava_token`, `jwt`, `access_token`, `refresh_token`, `password`. Hashed (not dropped): `email` → `email_hash` SHA256[:8].

---

## OBS-04 OTP code-leak fix (`identity/internal/service/otp.go:70-74`)

| Option | Code change | Selected |
|--------|-------------|----------|
| Gate `code` attr behind `if devMode { ... }` block (inline) | One-line conditional на attribute level | |
| **Drop `code` attr from prod path entirely + emit separately в `slog.DebugContext` if devMode (only emits at LOG_LEVEL=debug)** | Cleaner separation + handler also scrubs `code` key | **✓ (D-13)** |
| Just remove the line | Loses dev-mode echo entirely; breaks dev workflow | |

**Auto-selected:** D-13 — defense-in-depth (call-site gates + handler scrubs + CI greps the attribute name). Even если LOG_LEVEL accidentally promoted к debug в prod, the `code` attribute key is в `pii_deny_list` → dropped.

---

## Metrics library (OBS-05)

| Option | Notes | Selected |
|--------|-------|----------|
| **`prometheus/client_golang`** | Industry standard; matches existing `prometheus.yml` scrape config | **✓ (D-15)** |
| OpenTelemetry metrics SDK | Unified с traces but adds bridge complexity; Prom-format export не native | |
| StatsD | Push-model; doesn't match pull-based scrape config | |
| VictoriaMetrics native protocol | Drop-in Prom replacement; over-scoped | |

**Auto-selected:** prometheus/client_golang. Scrape config (Phase 0 era `prometheus.yml`) уже expects it.

---

## Cardinality budget enforcement (OBS-07)

| Option | Layer | Selected |
|--------|-------|----------|
| **Forbidden-label code review + CI grep + runtime cardinality probe** | 3-layer (engineering discipline + CI gate + observability) | **✓ (D-18)** |
| Code review only | Single layer; one missed PR → cardinality explosion | |
| Prometheus relabel_config drops высокого cardinality | Reactive; metric already explodes before drop | |
| Runtime probe only | Catches after explosion, not before | |

**Auto-selected:** 3-layer (D-18). Forbidden labels: `user_id`, `session_id`, `device_id`, `external_uuid`, `email`, `phone`. Allowed bucketed: `user_cohort` (≤10), `route` (≤50), `method` (5), `status` (5), `provider` (≤10).

---

## Tracing transport (Prom+OTLP per ROADMAP §Phase 5 Goal)

| Option | Notes | Selected |
|--------|-------|----------|
| **OpenTelemetry SDK + OTLP/HTTP → Sentry built-in OTLP receiver** | Sentry self-hosted ≥v24.x has native OTLP HTTP; simpler proxy setup | **✓ (D-20)** |
| OTLP/gRPC к Sentry | Requires HTTP/2 cleartext или separate TLS port; harder через Caddy | |
| Jaeger / Tempo separate backend | Adds 4th observability backend (Sentry + Prom + Loki + Tempo); overkill | |
| No tracing for v1.0 | ROADMAP explicitly says "Prom+OTLP" — non-negotiable | |

**Auto-selected:** OTLP/HTTP к Sentry (D-20). Researcher confirms exact endpoint syntax + auth.

---

## Alert routing (OBS-05 bullet 8)

| Option | Cost | Selected |
|--------|------|----------|
| **Telegram bot webhook** | Free; instant push к both devs' phones; scriptable | **✓ (D-24, D-25, D-26)** |
| PagerDuty | ~$20/user/mo × 2 = $40/mo; overkill for closed beta | |
| SMS via Twilio | Per-message fees + carrier delivery uncertainty | |
| Sentry email only | No phone push; missed during sleep | |

**Auto-selected:** Telegram (D-24). PagerDuty deferred к v1.1 if team grows.

---

## Log aggregation deployment (OBS-06)

| Option | Loki location + log shipping path | Selected |
|--------|-----------------------------------|----------|
| **Loki on sentry VPS, promtail на prod VPS pushing logs к Loki** | Isolation: app crash → logs still ship; sentry-VPS centralizes observability | **✓ (D-27, D-28, D-29)** |
| Loki on prod VPS, no remote shipping | App crashes → logs lost; defeats isolation | |
| Loki SaaS (Grafana Cloud Loki) | Free tier 50 GB/mo; vendor lock-in | |
| No log aggregation (Sentry-only) | Loses non-error log context (warnings, debug) | |

**Auto-selected:** Loki on sentry VPS (D-27). Promtail on prod VPS NOT containerized — systemd unit keeps log-ship independent of `sport-stack.service` health.

---

## Tester-mode debug logging seam (OBS-08)

| Option | Backend mechanism | Selected |
|--------|-------------------|----------|
| **`X-Debug-Session: 1` header + featureflag check + per-request slog level override** | Header-gated, featureflag-controlled, opt-in via mobile Settings (Phase 17 wires UI) | **✓ (D-22, D-23)** |
| Global LOG_LEVEL=debug toggle | Affects all sessions; defeats opt-in semantics | |
| JWT claim-based (e.g., `is_tester=true`) | Requires JWT re-issue on opt-in; slower toggle | |
| Cookie-based session | Doesn't survive mobile-app launch cycles | |

**Auto-selected:** Header + featureflag (D-22). Mobile Settings toggle UI + RU consent banner = Phase 17 scope (D-23).

---

## Sentry deploy seam (Ansible role)

| Option | Role implementation | Selected |
|--------|---------------------|----------|
| **New `sentry-prep` role wrapping `getsentry/self-hosted/install.sh` + idempotent re-runs use `docker compose up -d`** | Reuses Phase 3 `common` + `docker` + `ufw`; minimal new code | **✓ (D-30, D-31)** |
| Fork `install.sh` к pure-Ansible tasks | High maintenance; loses upstream improvements | |
| Helm chart on K8s | Requires K8s; не on roadmap | |
| Manual install via SSH session | Не idempotent; не GSD-style | |

**Auto-selected:** Wrapping role (D-30). Idempotency check: `creates: /opt/sentry/docker-compose.yml`.

---

## Claude's Discretion

(Auto-selected всё during `--auto` mode; nothing explicitly deferred к Claude беspoke. Researcher will refine 10 deferred questions listed в CONTEXT.md `<deferred>` section.)

## Deferred Ideas

Captured в CONTEXT.md `<deferred_ideas>` section. Highlights:

- **Mobile Sentry SDK install** (Phase 17 / CRASH-01..06) — DSNs land here; consumer side lands там
- **Real `<brand>.com` domain** — v1.1
- **PagerDuty integration** — v1.1 if team grows >2 devs
- **Distributed tracing mobile↔backend** — Phase 17 (mobile-side OTel) — v1.0 keeps backend-only OTel
- **Profile-mode SDK** (Sentry Continuous Profiling) — v1.1 once load patterns established
- **Per-tenant Sentry projects** (one per beta tester) — over-scoped; 4 projects suffice
- **Sentry releases integration с Phase 4 cosign tags** — Phase 17 (`sentry-cli releases new <tag>`)
- **Loki log-based alerting** — defer after Phase 8 baselines establish normal volume
- **Sentry SAML SSO** — v1.1
- **External-monitoring synthetic uptime probe** — v1.1 (Uptime-Kuma / Pingdom-like)

---

*Discussion mode: autonomous — auto-selected всё. User redirects in next session can rewrite any D-XX before plan-phase runs.*
