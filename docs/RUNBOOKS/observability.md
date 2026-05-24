# Observability Engineering RUNBOOK

> Engineer-facing reference: slog usage conventions, metric naming rules, PII deny-list, cardinality budget, and X-Debug-Session protocol. Sibling RUNBOOK to `sentry-ops.md` (ops-facing) and `deploy.md`.
>
> **Pinned versions** (per RESEARCH §4):
> - Go stdlib `log/slog` (Go ≥1.21)
> - Prometheus `client_golang` v1.20.5
> - OTel `v1.32.0` (otel + sdk + otlptracehttp, same minor)
> - `otelhttp` v0.57.0
> - `sentry-go` v0.46.2

## §1 slog usage conventions

Backend services используют `log/slog` stdlib (НЕ Zap, НЕ Logrus). Phase 2 / SEC-09 закрепил convention; Phase 5 / Plan 05-03 добавил JSON handler с PII scrub + default attrs (`service`, `env`, `version`, `request_id`).

### §1.1 Bootstrap (main.go pattern — D-32)

Каждый сервис в `cmd/server/main.go`:

```go
logger := observability.NewSlogJSONHandler(observability.Config{
    ServiceName: "identity",                          // hardcoded per service
    Env:         envOr("ENV", "prod"),
    Version:     envOr("BUILD_VERSION", "dev"),
    Level:       observability.ParseLevel(envOr("LOG_LEVEL", "info")),
})
slog.SetDefault(logger)
```

`ParseLevel` принимает `"debug" | "info" | "warn" | "error"` (case-insensitive); unknown/empty → `LevelInfo` fail-safe.

### §1.2 Conventions

✅ **DO** — structured attrs over message strings:

```go
slog.InfoContext(ctx, "session saved", "session_id", sessionID, "duration_ms", dur.Milliseconds())
```

❌ **DON'T** — `fmt.Sprintf` PII into the message body:

```go
slog.Info(fmt.Sprintf("user %s saved session %s", email, sessionID))  // PII bypass
```

✅ **DO** — use `slog.*Context` family for request-scoped logs (carries request_id via slog handler default attr injection):

```go
slog.InfoContext(ctx, "auth refresh", "user_id_hash", hash)
```

❌ **DON'T** — emit secrets or D-12 deny-list attribute names:

```go
slog.Info("user", "phone", phoneNumber)  // dropped by handler at runtime, but pii_audit.sh fails CI before merge
```

✅ **DO** — use `email_hash` indirection — handler auto-replaces:

```go
slog.Info("user lookup", "email", userEmail)
// Emits: {"email_hash":"a3f5b2c7","..."} — original email never serialized
```

### §1.3 Default attrs (always emitted)

Each record automatically carries:
- `service` (e.g., `"identity"`)
- `env` (e.g., `"prod"`)
- `version` (e.g., git SHA from `BUILD_VERSION`)
- `request_id` (UUID via `WithRequestID(ctx, id)` — middleware-attached; empty string if not set)

**Goal:** keep Loki LogQL schema stable across all services — `{service="identity"} | json | request_id="<uuid>"` is the canonical query shape.

## §2 Metric naming rules (D-17)

Each backend service exposes Prometheus metrics на `/metrics` via `pkg/observability.PromhttpMiddleware`. Per Phase 5 / Plan 05-04 / D-17, 6 standardized metric families:

| Family | Type | Purpose |
|---|---|---|
| `http_request_duration_seconds` | histogram | Per-route wall-clock latency (buckets для P50/P95/P99 derivation) |
| `http_requests_total` | counter | Request count per route × status code |
| `jwt_validation_total` | counter | JWT verify outcomes (result=`ok|expired|bad_sig|...`) |
| `nats_consumer_pending` | gauge | NATS consumer lag (warning rule fires >1000) |
| `db_query_duration_seconds` | histogram | DB query latency (P99 alert >500ms) |
| `external_api_duration_seconds` | histogram | Third-party API latency (Strava / OAuth provider / etc.) |

### §2.1 Naming conventions

- **Namespace prefix:** `http_*`, `jwt_*`, `nats_*`, `db_*`, `external_api_*`. New families must extend a prefix or RFC a new namespace.
- **Histogram buckets:** default Prometheus buckets are *too coarse* for sub-second latency. Use the project-wide bucket set from `pkg/observability/metrics.go`:
  `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]` (seconds).
- **No counter suffixes:** `client_golang` adds `_total` automatically; don't double it.

## §3 PII deny-list reference (D-12)

Source of truth: `services/backend/pkg/observability/pii_deny_list.go` — `PIIDenyList map[string]struct{}` (29 keys per D-12) + `EmailHashKeys` set (hashed, not dropped).

### §3.1 Current deny-list (drop entirely)

```
otp_code, code, otp                       (one-time passwords)
phone, phone_number, msisdn               (phone numbers)
displayName, display_name, name, fullName (user names)
external_uuid, strava_uuid, garmin_uuid   (3rd-party IDs)
lat, lng, lon, latitude, longitude        (GPS coords)
gps, location                             (location objects)
dm_content, message_body, content         (DM bodies)
secret, password, token, api_key,         (secrets)
mapbox_token, sentry_dsn, jwt
```

### §3.2 Email hashing (preserved, indirection)

```
email, user_email, email_address → key replaced with "email_hash",
                                    value replaced with HashEmail(value)
                                    (SHA-256 first 8 hex chars)
```

### §3.3 How to add a new entry

1. Append key to `PIIDenyList` in `pkg/observability/pii_deny_list.go`.
2. Add unit test row to `pii_deny_list_test.go` (deny-list lookup case).
3. Update this RUNBOOK §3.1 table.
4. CI grep audit (`scripts/pii_audit.sh`) auto-picks up the new key on next run.
5. Plan 05-06's runtime probe (`scripts/pii_live_probe.py`) **does NOT** auto-pick up new attr keys — it scans CONTENT patterns. If your new key represents a new PII *category*, also add a `PII_PATTERNS` entry to `pii_live_probe.py`.

### §3.4 Defense-in-depth (4 layers)

1. **Call-site discipline** — `if devMode { slog.Debug(...) }` gating (D-13 pattern).
2. **Handler scrub** — `piiScrubHandler.Handle` walks Attrs, drops/hashes per `pii_deny_list.go`.
3. **CI grep audit** — `scripts/pii_audit.sh` runs in `backend-ci.yml` + required-check branch protection.
4. **Runtime probe** — `scripts/pii_live_probe.py` queries Loki, regex-scans line CONTENT, exits 1 on first match.

## §4 Cardinality budget (D-18)

Prometheus label cardinality is the dominant cost driver. Per D-18:

### §4.1 Forbidden labels (CI gate enforces)

- `user_id` — explodes by user count (closed beta: 100 → eventually 10,000+)
- `request_id` — explodes per-request (∞ unique values)
- `session_id` — same as request_id
- `email` (even hashed) — explodes by user count
- Any UUID-shaped string

### §4.2 Allowed bucketed labels

- `status` — small finite set (200, 201, ..., 502, 504)
- `method` — GET/POST/PUT/DELETE (~6 values)
- `route` — TEMPLATED path, not raw URL (`/users/{id}` not `/users/abc-123-uuid`)
- `service` — small finite set (8 services)
- `env` — `prod | staging | dev`
- `result` — small finite set per family (`ok | expired | bad_sig | ...`)

### §4.3 CI gate

`scripts/cardinality_probe.py` запускается на каждом backend CI run:
- Scrapes `/metrics` from all 8 services
- Parses each metric family's label set
- Counts unique series per family
- Fails build on forbidden label OR series count exceeding budget (currently warn-only; per-family thresholds documented in script)

### §4.4 Adding a new metric safely

Checklist:

1. **Namespace prefix:** new family extends `http_*` / `jwt_*` / `nats_*` / `db_*` / `external_api_*` OR RFC a new prefix in ADR.
2. **Bucketed labels only:** no per-user, per-request, or per-UUID labels (see §4.1).
3. **Route templating:** if metric is per-endpoint, use the templated path (`/users/{id}`), not raw URL.
4. **HELP text:** `promauto.NewCounterVec` requires a HELP string — write a one-sentence purpose statement.
5. **Test:** add to `pkg/observability/metrics_test.go` (registration smoke) + verify CI cardinality probe passes.

## §5 X-Debug-Session protocol (RESEARCH §1.8 three-gate model)

Per Plan 05-06 / OBS-08 / D-22: `DebugSessionMiddleware` elevates per-request log level к `slog.LevelDebug` ONLY when ALL THREE gates pass:

1. HTTP header `X-Debug-Session: 1`
2. JWT claim `IsTester == true` (extracted via in-place `auth.Signer.VerifyAccess` on Bearer token)
3. Featureflag `tester_debug_logging` ON for that userID

Any missing → silent passthrough at `LevelInfo` (default). **NO slog emission on any gate failure** — pre-auth attacker spamming the header must NOT amplify log volume (debug-DoS vector per RESEARCH §1.8).

### §5.1 Mobile-side UX (Phase 17 territory)

v1.0 backend ships only the seam. Phase 17 (CRASH-01..06) inherits:
- Settings toggle in mobile app that emits `X-Debug-Session: 1` for outbound requests
- RU consent banner ("Включить отладочные логи на эту сессию? ...")
- Per-session scope (toggle resets on app cold-start to prevent permanent elevation)

### §5.2 Engineer-facing debug session

When investigating a bug:

1. Admin flips `tester_debug_logging` featureflag ON for tester via Phase 1 REL-03 admin UI (per-user rollout).
2. Tester reports bug with `X-Debug-Session: 1` header set (mobile Settings toggle or curl `--header`).
3. Backend services emit Debug-level slog records for that request — visible in Loki via `{service="identity"} | json | request_id="<uuid>"`.
4. After debug session: admin flips featureflag OFF; tester closes app (header cleared).

### §5.3 Threat model

| Threat | Mitigation |
|---|---|
| Pre-auth attacker spams `X-Debug-Session: 1` to inflate Loki costs | Gate 2 (JWT) fails → silent passthrough; no slog on gate failure → no log volume amplification |
| Compromised tester account inherits permanent debug | Gate 3 (featureflag) admin-controlled per-user; flip OFF revokes instantly via Phase 1 admin UI |
| Engineer accidentally elevates without consent | Gate 3 default=false; requires explicit admin grant per RESEARCH §1.8 |

## §6 Loki label hygiene (RESEARCH §P16)

Labels = slow-changing dims only. **NEVER** `request_id`, `session_id`, `user_id`, or any UUID-shaped value. Cardinality explosion:

```
loki_ingester_streams_created_total >10/sec  → warning sign (P16)
```

✅ **Allowed:**
- `env` (3 values)
- `cluster` (1 value currently)
- `service` (8 values; comes from container labels via Alloy)
- `level` (4 values; comes from slog JSON `"level":"info"`)

❌ **Forbidden as labels** (use INSIDE log JSON body):
- `request_id` — query via `|= "request_id=<uuid>"` or `| json | request_id="<uuid>"`
- `user_id_hash` — same pattern
- HTTP route — same

**Alloy config templates this** — see `infra/ansible/roles/alloy-shipper/templates/alloy-config.alloy.j2`. `labels = { env, cluster }` only.

## §7 Quick links

- [docs/RUNBOOKS/sentry-ops.md](sentry-ops.md) — operational runbook (deploy, rotation, alerts, walkthrough)
- [docs/DECISIONS/0009-observability-architecture.md](../DECISIONS/0009-observability-architecture.md) — ADR roll-up
- [docs/DECISIONS/0010-sentry-saas-and-colocation.md](../DECISIONS/0010-sentry-saas-and-colocation.md) — Sentry SaaS deferral
- [docs/TELEMETRY.md](../TELEMETRY.md) — opt-in mobile event allowlist (Phase 17 consumes)
- [.planning/phases/05-observability-backend/05-CONTEXT.md](../../.planning/phases/05-observability-backend/05-CONTEXT.md) — D-01..D-38 decision log
- [.planning/phases/05-observability-backend/05-RESEARCH.md](../../.planning/phases/05-observability-backend/05-RESEARCH.md) — Q1..Q10 + P12..P21

---

*RUNBOOK created: 2026-05-20 — Phase 5 / Plan 05-06 Task 5*
*Owner: solo dev (Ismail)*
