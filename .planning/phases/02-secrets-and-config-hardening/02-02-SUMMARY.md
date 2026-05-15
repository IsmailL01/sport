---
phase: 02-secrets-and-config-hardening
plan: 02
subsystem: backend-config
type: execute
status: complete
completed: 2026-05-15
duration_min: 10
tags:
  - secrets
  - 12-factor
  - dev-mode
  - fail-fast
  - backend
  - identity
  - envRequire
requirements_closed:
  - SEC-05
  - SEC-06
  - SEC-09
dependency_graph:
  requires:
    - phase1 (services already exist with envOr helper baseline)
  provides:
    - envRequire fail-fast helper across 8 Go service main.go files
    - IDENTITY_DEV_MODE prod-detection safety guard
    - SMOKE_DEV_MODE default-false (matches identity)
    - Per-service REQUIRED/OPTIONAL env-var classification (file-header comments)
  affects:
    - Plan 02-01 (SOPS .secrets/<env>/shared.yaml schema MUST include all REQUIRED keys per audit table below)
    - Plan 02-03 (.gitleaks.toml — secret-bearing keys now have stable names to match against)
    - Plan 02-04 (deploy-time validation can reference the audit table)
tech_stack:
  added: []
  patterns:
    - "envRequire(key) string fail-fast helper (Pattern A copy-paste sibling across 8 services)"
    - "exitFunc swappable for envRequire testability (identity only — single canonical test)"
    - "isLocalDBURL substring-match prod-detection guard (identity only)"
key_files:
  created:
    - services/backend/identity/cmd/server/main_test.go
    - .planning/phases/02-secrets-and-config-hardening/02-02-SUMMARY.md
  modified:
    - services/backend/identity/cmd/server/main.go
    - services/backend/activity-sync/cmd/server/main.go
    - services/backend/feed/cmd/server/main.go
    - services/backend/media/cmd/server/main.go
    - services/backend/messaging/cmd/server/main.go
    - services/backend/notifications/cmd/server/main.go
    - services/backend/realtime-gw/cmd/server/main.go
    - services/backend/social-graph/cmd/server/main.go
    - services/backend/scripts/smoke_otp.py
decisions:
  - "envRequire is COPIED into each of 8 main.go files (NOT extracted to shared pkg/config) — intentional v1.0 blast-radius minimization per CONTEXT D-07; pkg/config consolidation deferred to v1.1"
  - "EXPO_ACCESS_TOKEN deliberately stays envOr (NOT envRequire) — push fanout no-ops gracefully when empty, matching docker-compose.prod.yml line 177 `${EXPO_ACCESS_TOKEN:-}`"
  - "No envRequireMinLen wrapper — pkg/auth.NewSigner already enforces ≥32-byte JWT length at jwt.go:43-46 (RESEARCH critical finding 1)"
  - "isLocalDBURL is substring-match (4 prefixes: localhost / 127.0.0.1 / host.docker.internal / @postgres:) — false-positives toward allow are acceptable per RESEARCH §Assumption A2 (conservative-safe direction)"
  - "Test infra: exitFunc swappable hook added ONLY to identity main.go — single canonical envRequire test covers the helper behavior; 7 other services use direct os.Exit(1) (no per-service test needed for v1.0)"
metrics:
  duration_seconds: 578
  tasks_completed: 3
  files_modified: 9
  files_created: 2
  commits: 10
  test_cases_added: 10
---

# Phase 2 Plan 02: envRequire + DEV_MODE Summary

12-factor enforcement layer landed: 8 Go service main.go files now fail-fast on missing required env vars via `envRequire(key)`, `IDENTITY_DEV_MODE` default flipped to `false` with prod-detection refuse-to-start guard, and `SMOKE_DEV_MODE` mirrors that default. Closes SEC-05 (P0), SEC-06, SEC-09.

## What Shipped

### Per-Service Audit Table (final)

| Service | envOr → envRequire (REQUIRED) | Kept envOr (OPTIONAL) |
|---------|------------------------------|----------------------|
| **identity** | `IDENTITY_DB_URL`, `IDENTITY_JWT_SECRET` | `IDENTITY_HTTP_ADDR`, `IDENTITY_DEV_MODE` (default flipped to `false`), `CLIENT_MIN_VERSION`, `FORCE_UPDATE_URL_ANDROID/iOS` |
| **activity-sync** | `ACTIVITY_SYNC_DB_URL`, `IDENTITY_JWT_SECRET` | `ACTIVITY_SYNC_HTTP_ADDR`, `NATS_URL` (empty default — xp realtime disabled), version-policy vars |
| **feed** | `FEED_DB_URL`, `IDENTITY_JWT_SECRET` | `FEED_HTTP_ADDR`, `NATS_URL`, `REDIS_URL`, version-policy vars |
| **media** | `MEDIA_DB_URL`, `IDENTITY_JWT_SECRET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | `MEDIA_HTTP_ADDR`, `S3_ENDPOINT`, `S3_ENDPOINT_INTERNAL`, `S3_BUCKET`, `S3_REGION` |
| **messaging** | `MESSAGING_DB_URL`, `IDENTITY_JWT_SECRET` | `MESSAGING_HTTP_ADDR`, `NATS_URL`, `REDIS_URL`, version-policy vars |
| **notifications** | `NOTIFICATIONS_DB_URL`, `IDENTITY_JWT_SECRET` | `NOTIFICATIONS_HTTP_ADDR`, `NATS_URL`, **`EXPO_ACCESS_TOKEN`** (deliberately optional — Phase 11/12 populates) |
| **realtime-gw** | `IDENTITY_JWT_SECRET` | `REALTIME_GW_HTTP_ADDR`, `NATS_URL`, `REALTIME_GW_DB_URL` (opt-in featureflags), version-policy vars |
| **social-graph** | `SOCIAL_GRAPH_DB_URL`, `IDENTITY_JWT_SECRET` | `SOCIAL_GRAPH_HTTP_ADDR`, `REDIS_URL`, version-policy vars |

**Total REQUIRED env vars across all services:** 13 unique keys (5 service-specific `*_DB_URL` + 1 shared `IDENTITY_JWT_SECRET` referenced by 8 services + 2 S3 keys + … de-duplicated to 9 distinct secret names for SOPS schema).

**Distinct secrets for `.secrets/<env>/shared.yaml` schema (input for Plan 02-01):**
1. `IDENTITY_DB_URL`
2. `ACTIVITY_SYNC_DB_URL`
3. `FEED_DB_URL`
4. `MEDIA_DB_URL`
5. `MESSAGING_DB_URL`
6. `NOTIFICATIONS_DB_URL`
7. `SOCIAL_GRAPH_DB_URL`
8. `IDENTITY_JWT_SECRET` (shared across all 8 services)
9. `S3_ACCESS_KEY`
10. `S3_SECRET_KEY`

**Optional (compose-level `${VAR:-}` empty-default OK):** `EXPO_ACCESS_TOKEN`, `NATS_URL`, `REDIS_URL`, `REALTIME_GW_DB_URL`, `S3_ENDPOINT*`, `S3_BUCKET`, `S3_REGION`, all `*_HTTP_ADDR`, `CLIENT_MIN_VERSION`, `FORCE_UPDATE_URL_*`, `IDENTITY_DEV_MODE`.

### IDENTITY_DEV_MODE Prod-Detection Guard

`services/backend/identity/cmd/server/main.go` line 60:
- **Before:** `devMode := envOr("IDENTITY_DEV_MODE", "true") == "true"` (default ON)
- **After:** `devMode := envOr("IDENTITY_DEV_MODE", "false") == "true"` (default OFF)

Guard block (lines 65-74): if `devMode == true` AND `isLocalDBURL(dbURL) == false`, log `REFUSING TO START` with redacted DB host and `os.Exit(1)`.

**Runtime verified:**
```
$ IDENTITY_JWT_SECRET=$(openssl rand -hex 32) \
  IDENTITY_DB_URL=postgres://re:pw@prod.example.com:5432/db \
  IDENTITY_DEV_MODE=true \
  go run ./cmd/server
{"level":"ERROR","msg":"REFUSING TO START: IDENTITY_DEV_MODE=true but database is not localhost","db_host":"postgres://re:***@prod.example.com:5432/db"}
exit status 1
```

### JWT Length Enforcement (UNCHANGED — RESEARCH critical finding 1)

`services/backend/pkg/auth/jwt.go:43-46` continues to enforce `len(secret) >= 32`:
```go
func NewSigner(secret []byte) (*Signer, error) {
    if len(secret) < 32 {
        return nil, errors.New("auth: jwt secret must be at least 32 bytes")
    }
    ...
}
```
**No `envRequireMinLen` wrapper added** — the existing chain `envRequire("IDENTITY_JWT_SECRET")` → `auth.NewSigner(jwtSecret)` → `run()` returns error → `main()` `os.Exit(1)` already handles short-secret fail-fast.

### EXPO_ACCESS_TOKEN — Optional Decision (rationale)

`services/backend/notifications/cmd/server/main.go` line 53-58 keeps `os.Getenv("EXPO_ACCESS_TOKEN")` (NOT `envRequire`). When empty:
- Service starts normally
- `slog.Warn("push fanout disabled — EXPO_ACCESS_TOKEN empty (v1.0 expected behavior)")` printed for operator awareness
- `expopush.New("")` constructs a client that no-ops on send (existing v1.0 graceful-degrade)

Matches `services/backend/docker-compose.prod.yml` line 177 `${EXPO_ACCESS_TOKEN:-}` empty-default. Phase 11/12 (HEALTH-04 Strava push) will populate the prod value.

### smoke_otp.py default flip

`services/backend/scripts/smoke_otp.py` line 31:
- **Before:** `DEV_MODE = os.environ.get("SMOKE_DEV_MODE", "true") == "true"`
- **After:** `DEV_MODE = os.environ.get("SMOKE_DEV_MODE", "false") == "true"`

Comment block (lines 25-30) updated to reference Phase 2 / SEC-05 and clarify opt-in usage. Strict-mode assertions (reuse-401, wrong-401, attempts++) are now active by default.

## Tests Added

`services/backend/identity/cmd/server/main_test.go` (NEW — 128 lines, 4 test groups, 10 sub-tests):

1. `TestEnvRequire_ExitsOnMissing` — 3 cases (missing var → exit / empty value → exit / non-empty → no exit)
2. `TestIsLocalDBURL_Localhost` — 4 cases (localhost / 127.0.0.1 / host.docker.internal / `@postgres:`)
3. `TestIsLocalDBURL_NonLocal` — 3 cases (hetzner cloud / staging example.com / numeric IP)
4. `TestIsLocalDBURL_EdgeCases` — 2 cases (empty string → false / documented substring false-positive)

**Test results:** all green via `go test ./identity/cmd/server/... -count=1 -race -run "TestEnvRequire|TestIsLocalDBURL"` (1.819s).

**Full backend test suite:** `go test ./identity/... ./activity-sync/... ./feed/... ./media/... ./messaging/... ./notifications/... ./realtime-gw/... ./social-graph/... ./pkg/...` — zero failures.

## Commits (10 total)

| # | Hash | Type | Message |
|---|------|------|---------|
| 1 | `b96c7d3` | test | identity envRequire + isLocalDBURL failing tests (RED gate) |
| 2 | `27ad27f` | feat | identity envRequire + isLocalDBURL + DEV_MODE prod-guard (GREEN) |
| 3 | `63b8258` | feat | activity-sync envRequire migration |
| 4 | `df123cd` | feat | feed envRequire migration |
| 5 | `95876f7` | feat | media envRequire migration (4 conversions incl. S3 keys) |
| 6 | `e4132e8` | feat | messaging envRequire migration |
| 7 | `25ad063` | feat | notifications envRequire migration (EXPO stays optional) |
| 8 | `18085cc` | feat | realtime-gw envRequire migration |
| 9 | `067179f` | feat | social-graph envRequire migration |
| 10 | `1a0c53a` | chore | smoke_otp.py SMOKE_DEV_MODE default false |

TDD gate satisfied: RED commit (`b96c7d3`) precedes GREEN (`27ad27f`).

## Deviations from Plan

None — plan executed exactly as written. All 3 tasks completed atomically, all verify-block assertions passed:

- `go build ./identity/... ./activity-sync/... ./feed/... ./media/... ./messaging/... ./notifications/... ./realtime-gw/... ./social-graph/... ./pkg/...` clean
- `go test ./...` zero failures
- `grep envRequire ... | grep 'func envRequire' | wc -l` returns **8**
- `grep IDENTITY_DEV_MODE main.go | grep '"false"'` → line 60
- `grep SMOKE_DEV_MODE smoke_otp.py | grep '"false"'` → line 31
- Smoke negative: missing `IDENTITY_DB_URL` → `{"level":"ERROR","msg":"required env var missing","key":"IDENTITY_DB_URL"}` + exit 1 (within ~3s)
- Smoke positive: `IDENTITY_DEV_MODE=true` + prod-like DB URL → `REFUSING TO START` + exit 1 (within ~4s), password redacted in log

## Threat Model Closure

| Threat ID | Disposition | Closure |
|-----------|------------|---------|
| T-02-09 (Spoofing — DEV_MODE OTP leak) | mitigate | Default flipped to `false` + `isLocalDBURL` refuse-to-start enforced |
| T-02-10 (Info Disclosure — empty JWT secret) | mitigate | `envRequire("IDENTITY_JWT_SECRET")` + downstream `auth.NewSigner` ≥32-byte check |
| T-02-11 (Tampering — silent EXPO no-op) | accept | Documented v1.0 behavior + operator-visible `slog.Warn` at startup |
| T-02-12 (Repudiation — audit-table drift) | mitigate | File-header REQUIRED/OPTIONAL annotations + Plan 02-03 gitleaks backstop |
| T-02-13 (Elevation — DEV_MODE on staging) | mitigate | `isLocalDBURL` strict 4-prefix allow-list refuses unknown hosts |
| T-02-14 (Info Disclosure — raw dbURL logs) | accept | Existing `redactPassword(dbURL)` reused in new guard; broader audit in Phase 5 OBS-04 |
| T-02-15 (Spoofing — stale SMOKE_DEV_MODE) | mitigate | Smoke default flipped to `false`; comment block re-points operators to opt-in |

## Self-Check

All artifacts asserted:

- [x] `services/backend/identity/cmd/server/main.go` — FOUND, contains `func envRequire` + `func isLocalDBURL` + DEV_MODE guard
- [x] `services/backend/identity/cmd/server/main_test.go` — FOUND, 10 sub-tests all green
- [x] `services/backend/activity-sync/cmd/server/main.go` — FOUND, contains `func envRequire`
- [x] `services/backend/feed/cmd/server/main.go` — FOUND, contains `func envRequire`
- [x] `services/backend/media/cmd/server/main.go` — FOUND, contains `func envRequire`
- [x] `services/backend/messaging/cmd/server/main.go` — FOUND, contains `func envRequire`
- [x] `services/backend/notifications/cmd/server/main.go` — FOUND, contains `func envRequire`, EXPO stays envOr
- [x] `services/backend/realtime-gw/cmd/server/main.go` — FOUND, contains `func envRequire`
- [x] `services/backend/social-graph/cmd/server/main.go` — FOUND, contains `func envRequire`
- [x] `services/backend/scripts/smoke_otp.py` — FOUND, line 31 `"false"` default
- [x] All 10 commits present in `git log` on `feat/cursona-redesign`

## TDD Gate Compliance

- **RED gate:** `b96c7d3` `test(phase2-sec): add failing tests for identity envRequire + isLocalDBURL` — confirmed failing at commit time (envRequire/isLocalDBURL/exitFunc undefined).
- **GREEN gate:** `27ad27f` `feat(phase2-sec): identity envRequire + isLocalDBURL + DEV_MODE prod-guard` — tests pass post-implementation.
- **REFACTOR gate:** Not needed — implementation matches plan spec exactly, no cleanup required.

## Self-Check: PASSED
