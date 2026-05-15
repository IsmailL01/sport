---
phase: 02-secrets-and-config-hardening
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - services/backend/identity/cmd/server/main.go
  - services/backend/identity/cmd/server/main_test.go
  - services/backend/activity-sync/cmd/server/main.go
  - services/backend/feed/cmd/server/main.go
  - services/backend/media/cmd/server/main.go
  - services/backend/messaging/cmd/server/main.go
  - services/backend/notifications/cmd/server/main.go
  - services/backend/realtime-gw/cmd/server/main.go
  - services/backend/social-graph/cmd/server/main.go
  - services/backend/scripts/smoke_otp.py
autonomous: true
requirements:
  - SEC-05
  - SEC-06
  - SEC-09
tags:
  - secrets
  - 12-factor
  - dev-mode
  - fail-fast
  - backend
  - identity

must_haves:
  truths:
    - "Each of the 8 Go service main.go files defines an `envRequire(key string) string` helper that calls `slog.Error` + `os.Exit(1)` on missing/empty env var"
    - "All secret-bearing env var lookups (DB_URL with embedded password, IDENTITY_JWT_SECRET, S3_ACCESS_KEY, S3_SECRET_KEY per RESEARCH §env-require audit table) use `envRequire`, not `envOr`"
    - "`NOTIFICATIONS/EXPO_ACCESS_TOKEN` remains optional via `envOr` per RESEARCH finding — service still starts when push fanout becomes a no-op (matches docker-compose.prod.yml line 177 `${EXPO_ACCESS_TOKEN:-}` empty-default semantics)"
    - "`IDENTITY_DEV_MODE` default is `false` at `services/backend/identity/cmd/server/main.go:50`"
    - "If `IDENTITY_DEV_MODE=true` is set AND `IDENTITY_DB_URL` does not match any of {localhost, 127.0.0.1, host.docker.internal, @postgres:}, the service refuses to start (logs `slog.Error` + exits 1)"
    - "`pkg/auth.NewSigner` ≥32-byte enforcement is documented as the JWT length check (per RESEARCH critical finding 1 — no new `envRequireMinLen` wrapper added)"
    - "`services/backend/scripts/smoke_otp.py` `SMOKE_DEV_MODE` default is `false` (matches identity service default)"
    - "Unit test exists: `IDENTITY_DEV_MODE=true` + non-local DB URL → service exits 1 within 5s"
    - "Unit test exists: missing `IDENTITY_JWT_SECRET` → service exits 1 within 5s"
  artifacts:
    - path: services/backend/identity/cmd/server/main.go
      provides: "envRequire helper + isLocalDBURL helper + IDENTITY_DEV_MODE prod-detection guard + flipped default"
      contains: "func envRequire"
    - path: services/backend/activity-sync/cmd/server/main.go
      provides: "envRequire helper + converted DB_URL/JWT_SECRET call sites"
      contains: "func envRequire"
    - path: services/backend/feed/cmd/server/main.go
      provides: "envRequire helper + converted DB_URL/JWT_SECRET call sites"
      contains: "func envRequire"
    - path: services/backend/media/cmd/server/main.go
      provides: "envRequire helper + converted DB_URL/JWT_SECRET/S3_ACCESS_KEY/S3_SECRET_KEY call sites"
      contains: "func envRequire"
    - path: services/backend/messaging/cmd/server/main.go
      provides: "envRequire helper + converted DB_URL/JWT_SECRET call sites"
      contains: "func envRequire"
    - path: services/backend/notifications/cmd/server/main.go
      provides: "envRequire helper + converted DB_URL/JWT_SECRET call sites — EXPO_ACCESS_TOKEN deliberately kept optional"
      contains: "func envRequire"
    - path: services/backend/realtime-gw/cmd/server/main.go
      provides: "envRequire helper + converted JWT_SECRET call site"
      contains: "func envRequire"
    - path: services/backend/social-graph/cmd/server/main.go
      provides: "envRequire helper + converted DB_URL/JWT_SECRET call sites"
      contains: "func envRequire"
    - path: services/backend/identity/cmd/server/main_test.go
      provides: "Test cases for envRequire fail-fast + isLocalDBURL prod-detection + DEV_MODE refuse-to-start"
      contains: "TestIsLocalDBURL"
    - path: services/backend/scripts/smoke_otp.py
      provides: "SMOKE_DEV_MODE default flipped to false; comment updated to reference Phase 2 / SEC-05"
      contains: "SMOKE_DEV_MODE"
  key_links:
    - from: services/backend/identity/cmd/server/main.go
      to: services/backend/pkg/auth/jwt.go
      via: "auth.NewSigner(jwtSecret) — existing ≥32-byte enforcement preserved"
      pattern: "auth\\.NewSigner"
    - from: services/backend/identity/cmd/server/main.go (DEV_MODE block)
      to: "isLocalDBURL helper at bottom of same file"
      via: "function call inside `if devMode { ... }` block"
      pattern: "isLocalDBURL\\(dbURL\\)"
    - from: services/backend/notifications/cmd/server/main.go
      to: services/backend/docker-compose.prod.yml line 177
      via: "EXPO_ACCESS_TOKEN remains `envOr(\"EXPO_ACCESS_TOKEN\", \"\")` matching compose `${EXPO_ACCESS_TOKEN:-}` empty-default"
      pattern: "EXPO_ACCESS_TOKEN.*envOr"
---

<objective>
Land the 12-factor enforcement layer: add `envRequire(key string) string` to all 8 Go service main.go files, convert every secret-bearing `envOr` call site to `envRequire` per the RESEARCH §env-require audit table, flip `IDENTITY_DEV_MODE` default to `false` with prod-detection refuse-to-start safety, and flip `SMOKE_DEV_MODE` to match. This plan delivers SEC-05 (P0 from CONCERNS.md), SEC-06 (12-factor split), and SEC-09 (secret loading audit fail-fast).

Purpose: A dev with stale env vars cannot accidentally enable DEV_MODE on prod (Pitfall: OTP code leak via Spoofing per STRIDE). Every Go service must fail loudly at startup if a required secret is missing — eliminates the "service starts with empty JWT_SECRET and serves bogus tokens" footgun. RESEARCH critical finding 1 corrects CONTEXT D-07: `pkg/auth.NewSigner` ALREADY enforces 32-byte JWT length at `services/backend/pkg/auth/jwt.go:43-46`, so NO `envRequireMinLen` wrapper is needed — `envRequire` alone is sufficient.

Output: 8 modified main.go files, 1 modified smoke script, 1 new test file in the identity service.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/02-secrets-and-config-hardening/02-CONTEXT.md
@.planning/phases/02-secrets-and-config-hardening/02-RESEARCH.md
@.planning/phases/02-secrets-and-config-hardening/02-PATTERNS.md
@.planning/codebase/CONCERNS.md
@CLAUDE.md
@services/backend/identity/cmd/server/main.go
@services/backend/pkg/auth/jwt.go
@services/backend/docker-compose.prod.yml

<!-- Existing interfaces this plan modifies — extracted from PATTERNS.md and verified via grep -->
<interfaces>
Canonical helpers already in `services/backend/identity/cmd/server/main.go`:
```go
// Line 121-126 (KEEP — canonical envOr for non-secrets)
func envOr(key, def string) string {
    if v := os.Getenv(key); v != "" {
        return v
    }
    return def
}

// Line 130-152 (REUSE for new safety check — redacts password before logging dbURL)
func redactPassword(url string) string { /* ... */ }
```

Already-shipped 32-byte JWT length enforcement at `services/backend/pkg/auth/jwt.go:43-46`:
```go
if len(secret) < 32 {
    return nil, errors.New("auth: jwt secret must be at least 32 bytes")
}
```
This means `envRequire("IDENTITY_JWT_SECRET")` is sufficient — the length check is downstream in `auth.NewSigner(jwtSecret)` and bubbles via `run()` → `main()` → `os.Exit(1)`. DO NOT add a length variant.

Per-service audit table (RESEARCH §env-require Code Examples — exact line numbers verified):

| Service | envOr → envRequire | Line numbers | Keep envOr |
|---------|--------------------|--------------|-----------|
| identity | `IDENTITY_DB_URL`, `IDENTITY_JWT_SECRET` | 46, 47 | HTTP_ADDR (45), IDENTITY_DEV_MODE (50 — default flips this plan), CLIENT_MIN_VERSION/FORCE_UPDATE_URL_* (89-91) |
| activity-sync | `ACTIVITY_SYNC_DB_URL`, `IDENTITY_JWT_SECRET` | 44, 45 | HTTP_ADDR, NATS_URL (empty-default sentinel), version-policy |
| feed | `FEED_DB_URL`, `IDENTITY_JWT_SECRET` | 42, 43 | HTTP_ADDR, NATS_URL, REDIS_URL, version-policy |
| media | `MEDIA_DB_URL`, `IDENTITY_JWT_SECRET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | 50, 51, 74, 75 | HTTP_ADDR, S3_ENDPOINT, S3_BUCKET, S3_REGION |
| messaging | `MESSAGING_DB_URL`, `IDENTITY_JWT_SECRET` | 45, 46 | HTTP_ADDR, NATS_URL, REDIS_URL |
| notifications | `NOTIFICATIONS_DB_URL`, `IDENTITY_JWT_SECRET` | 47, 48 | HTTP_ADDR, NATS_URL, **`EXPO_ACCESS_TOKEN`** (optional — keep as envOr per RESEARCH note + PATTERNS.md special-case + Pattern G `${VAR:-}` compose-level) |
| realtime-gw | `IDENTITY_JWT_SECRET` | 41 | HTTP_ADDR, NATS_URL, DB_URL (empty default, used optionally) |
| social-graph | `SOCIAL_GRAPH_DB_URL`, `IDENTITY_JWT_SECRET` | 45, 46 | HTTP_ADDR, REDIS_URL |

IDENTITY_DEV_MODE flip target (line 50 of identity main.go):
- Current: `devMode := envOr("IDENTITY_DEV_MODE", "true") == "true"`
- New: `devMode := envOr("IDENTITY_DEV_MODE", "false") == "true"` + `if devMode && !isLocalDBURL(dbURL) { slog.Error(...); os.Exit(1) }`

isLocalDBURL helper definition (PATTERNS.md §`isLocalDBURL` analog of `redactPassword`):
```go
func isLocalDBURL(url string) bool {
    return strings.Contains(url, "localhost") ||
        strings.Contains(url, "127.0.0.1") ||
        strings.Contains(url, "host.docker.internal") ||
        strings.Contains(url, "@postgres:")
}
```
Requires adding `"strings"` import (verify it isn't already present — current import block does NOT include strings per the `redactPassword` implementation which uses a manual byte scan).

smoke_otp.py target (line 28):
- Current: `DEV_MODE = os.environ.get("SMOKE_DEV_MODE", "true") == "true"`
- New: `DEV_MODE = os.environ.get("SMOKE_DEV_MODE", "false") == "true"`
- Comment block at lines 25-27 updated to reference Phase 2 / SEC-05.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: identity main.go — envRequire + isLocalDBURL + DEV_MODE flip + tests</name>
  <files>services/backend/identity/cmd/server/main.go, services/backend/identity/cmd/server/main_test.go</files>
  <behavior>
    Test cases (write tests FIRST, then implementation per Task tdd="true" gate; live in `main_test.go` next to `main.go`):
    1. `TestEnvRequire_ExitsOnMissing` — set env, unset, assert helper `os.Exit(1)` semantics. Since `os.Exit` is hard to test directly, wrap by extracting `envRequire` to call a swappable `exitFunc` variable defaulting to `os.Exit`; tests override to a sentinel that records calls. Match the `redactPassword` test style (table-driven if existing tests use that idiom).
    2. `TestIsLocalDBURL_Localhost` — cases: `postgres://re:pw@localhost:5432/db` → true; `127.0.0.1` → true; `host.docker.internal` → true; `@postgres:5432` → true.
    3. `TestIsLocalDBURL_NonLocal` — cases: `postgres://re:pw@prod-host.hetzner.cloud:5432/db` → false; `@db.staging.example.com` → false; `@198.51.100.10` → false (numeric non-local).
    4. `TestIsLocalDBURL_EdgeCases` — empty string → false; URL with `localhost` in path but not host (e.g. `postgres://re:pw@prod/localhost_db`) → returns true per current substring-match implementation (acceptable false-positive per RESEARCH §Assumption A2 — conservative safe direction; document in test name).
  </behavior>
  <action>
    Modify `services/backend/identity/cmd/server/main.go` per D-13 + D-07 + RESEARCH critical finding 1:

    1. Add `"strings"` to the import block (currently at lines 12-32; insert alphabetically between existing imports).
    2. Convert `envOr("IDENTITY_DB_URL", "postgres://re:re_dev@localhost:5432/...")` at line 46 → `envRequire("IDENTITY_DB_URL")`. The dev-default URL value moves to `.secrets/dev/shared.yaml` per 02-01.
    3. Convert `envOr("IDENTITY_JWT_SECRET", "dev-secret-must-be-at-least-32-bytes-long!!")` at line 47 → `envRequire("IDENTITY_JWT_SECRET")`. Length check stays at `pkg/auth.NewSigner` (line 52-55) — DO NOT add a length variant per RESEARCH critical finding 1.
    4. Flip line 50: `envOr("IDENTITY_DEV_MODE", "true")` → `envOr("IDENTITY_DEV_MODE", "false")`. Update the comment at line 49 — replace "В production выставить IDENTITY_DEV_MODE=false." with "Дефолт false; включить вручную для local dev." (Russian per Pattern D / CLAUDE.md).
    5. After line 50's `devMode :=` assignment, add the prod-detection guard per RESEARCH §dev-mode-safety Code Examples:
       ```
       if devMode {
           if !isLocalDBURL(dbURL) {
               slog.Error(
                   "REFUSING TO START: IDENTITY_DEV_MODE=true but database is not localhost",
                   "db_host", redactPassword(dbURL),
               )
               os.Exit(1)
           }
           slog.Warn("IDENTITY_DEV_MODE=true — OTP devCode WILL be returned in /auth/request-code; this MUST NOT happen in prod")
       }
       ```
    6. Add `envRequire` helper next to existing `envOr` at the bottom of `main.go` (after line 126 — preserve file shape per Pattern B `slog.Error` + `os.Exit(1)` fail-fast):
       ```
       func envRequire(key string) string {
           v := os.Getenv(key)
           if v == "" {
               slog.Error("required env var missing", "key", key)
               os.Exit(1)
           }
           return v
       }
       ```
       Per Behavior block: to make this testable, factor out an `exitFunc = os.Exit` package-level var; helper calls `exitFunc(1)`. Tests swap to a recording stub.
    7. Add `isLocalDBURL` helper at the very bottom (after `redactPassword`), matching that helper's pure-string-scan style.
    8. Update the file header ENV-block (lines 1-10) per Pattern A: annotate `IDENTITY_DB_URL` and `IDENTITY_JWT_SECRET` as `REQUIRED` (no default); other vars as `OPTIONAL`.

    Then write the tests in `main_test.go` per the Behavior block. If `main_test.go` doesn't exist, create it. Match existing test idiom in `services/backend/identity/internal/*_test.go` (table-driven, t.Run subtests). Run `cd services/backend && go test ./identity/... -count=1 -race -run "TestEnvRequire|TestIsLocalDBURL"` and confirm green.
  </action>
  <verify>
    <automated>cd services/backend && go build ./identity/... && go test ./identity/... -count=1 -race -run "TestEnvRequire|TestIsLocalDBURL"</automated>
  </verify>
  <done>identity main.go has `envRequire` + `isLocalDBURL`; line 46-47 use `envRequire`; line 50 default is `"false"`; DEV_MODE guard block exists between line 50 and the next existing block; main_test.go has the 4 test cases all green; `go build` clean; `go test ./identity/...` passes. Atomic commit: `feat(phase2-sec): identity envRequire + isLocalDBURL + DEV_MODE prod-guard (SEC-05/06/09)`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 7 remaining service main.go files — envRequire propagation</name>
  <files>services/backend/activity-sync/cmd/server/main.go, services/backend/feed/cmd/server/main.go, services/backend/media/cmd/server/main.go, services/backend/messaging/cmd/server/main.go, services/backend/notifications/cmd/server/main.go, services/backend/realtime-gw/cmd/server/main.go, services/backend/social-graph/cmd/server/main.go</files>
  <behavior>
    For each of the 7 services, the existing test suite (`*_test.go` in `internal/`) must still pass with `go test ./... -count=1 -race`. No new test files required for these services in v1.0 — the identity test (Task 1) covers the helper behavior, and CONTEXT D-07 explicitly defers a `pkg/config` shared lib to v1.1 (the 8 × 6-line duplications are intentional v1.0 blast-radius minimization).

    Smoke-style behavior assertion (verified by `verify` step, not codified as `_test.go`):
    - `cd services/backend/<svc> && unset IDENTITY_JWT_SECRET && timeout 5 go run ./cmd/server` must exit non-zero within 5s for each of: activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph.
    - `cd services/backend/notifications && IDENTITY_JWT_SECRET=$(openssl rand -hex 32) NOTIFICATIONS_DB_URL=postgres://re:re_dev@localhost:5432/x?sslmode=disable EXPO_ACCESS_TOKEN= timeout 5 go run ./cmd/server` must NOT exit on `EXPO_ACCESS_TOKEN` missing (kept optional per RESEARCH note + PATTERNS.md notifications special-case). It WILL exit on the DB unreachable — that's expected; the assertion is "exit reason is DB connect failure, not env-var missing."
  </behavior>
  <action>
    For each of the 7 main.go files (activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph), apply the same 6-step pattern as Task 1 minus the DEV_MODE block (only identity has that):

    1. Verify the existing `envOr` helper is at the bottom of the file (PATTERNS.md confirms all 8 share the same shape).
    2. Add `envRequire` helper next to `envOr` — identical 7-line block as identity (no need to re-extract `exitFunc` per file; for v1.0 keep these per-service copies simple — `os.Exit(1)` direct is fine since the test coverage lives in identity's `main_test.go` covering the canonical helper shape).
    3. Convert call sites per the audit table in `<interfaces>` block above. EXACT line numbers and EXACT variable names from RESEARCH §env-require audit. Each file gets 1–4 conversions.
    4. Update the file header ENV-block (lines 1-10) per Pattern A — mark DB_URL and JWT_SECRET (and S3_* for media) as REQUIRED.
    5. **notifications/main.go special handling**: `EXPO_ACCESS_TOKEN` stays as `envOr("EXPO_ACCESS_TOKEN", "")` per RESEARCH §env-require notes + PATTERNS.md notifications special-case (matches compose `${EXPO_ACCESS_TOKEN:-}` empty-default at line 177 of docker-compose.prod.yml). Push fanout becomes a no-op when empty — this is the documented v1.0 behavior. Add an inline comment: `// EXPO_ACCESS_TOKEN: optional v1.0 — empty => push fanout no-ops per docker-compose.prod.yml line 177`.
    6. Per-service: run `cd services/backend && go build ./<svc>/... && go test ./<svc>/... -count=1 -race` and confirm clean.

    Atomic commit per service (7 commits total) — keeps blast radius small per PATTERNS.md §Established Patterns. Commit message format: `feat(phase2-sec): <svc> envRequire migration (SEC-06/09)`.
  </action>
  <verify>
    <automated>cd services/backend && go build ./... && go test ./activity-sync/... ./feed/... ./media/... ./messaging/... ./notifications/... ./realtime-gw/... ./social-graph/... -count=1 -race</automated>
  </verify>
  <done>All 7 main.go files have `envRequire` helper; audit-table call sites converted; `EXPO_ACCESS_TOKEN` remains optional in notifications; all existing tests green; `go build ./...` clean for `services/backend/`. 7 atomic commits land (one per service).</done>
</task>

<task type="auto">
  <name>Task 3: smoke_otp.py SMOKE_DEV_MODE default flip</name>
  <files>services/backend/scripts/smoke_otp.py</files>
  <action>
    Modify `services/backend/scripts/smoke_otp.py` per D-14 + PATTERNS.md §smoke_otp.py:

    1. Change line 28 `DEV_MODE = os.environ.get("SMOKE_DEV_MODE", "true") == "true"` → `DEV_MODE = os.environ.get("SMOKE_DEV_MODE", "false") == "true"`.
    2. Update the comment block at lines 25-27 to reference Phase 2 / SEC-05:
       ```python
       # Phase M9.5 → Phase 2 / SEC-05: default flipped to false to match identity
       # service default. Set SMOKE_DEV_MODE=true explicitly for local-only OTP-relaxed
       # smoke (against a localhost identity service with IDENTITY_DEV_MODE=true).
       # Russian context: identity-service в IDENTITY_DEV_MODE=true принимает ЛЮБОЙ
       # 6-значный код (для тестов с APK без email); этот smoke в strict-режиме теперь
       # включён по умолчанию (проверяет reuse-401, wrong-401).
       ```
    3. No code change beyond the default flip — the `if DEV_MODE:` branch at line 88 still functions correctly; an opt-in `SMOKE_DEV_MODE=true` invocation reaches the same code path.

    Run a sanity smoke: `cd services/backend && python3 -c "import importlib.util,sys; spec = importlib.util.spec_from_file_location('s', 'scripts/smoke_otp.py'); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); print('DEV_MODE default:', m.DEV_MODE)"`. Output must be `DEV_MODE default: False`.
  </action>
  <verify>
    <automated>grep -n 'SMOKE_DEV_MODE' services/backend/scripts/smoke_otp.py | grep -q '"false"' && python3 -c "import os; os.environ.pop('SMOKE_DEV_MODE', None); import importlib.util; spec = importlib.util.spec_from_file_location('s', 'services/backend/scripts/smoke_otp.py'); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); assert m.DEV_MODE is False, 'expected False, got ' + repr(m.DEV_MODE); print('OK')"</automated>
  </verify>
  <done>smoke_otp.py line 28 has `"false"` default; comment block updated to reference Phase 2 / SEC-05; verify command prints `OK`. Atomic commit: `fix(phase2-sec): flip SMOKE_DEV_MODE default to false to match identity (SEC-05)`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| operator-shell ↔ service-process | env vars passed via docker-compose `--env-file` cross this boundary; missing required vars must fail loudly (not silently start with empty defaults) |
| dev-mode-flag ↔ production-database | `IDENTITY_DEV_MODE=true` returning OTP devCode in `/auth/request-code` MUST never reach production data — prod-detection guard enforces |
| smoke-script ↔ identity-service-under-test | `smoke_otp.py` previously assumed dev-mode by default (relaxed assertions) — flipped to assume strict mode, surface real regressions earlier |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-09 | Spoofing | identity-service `/auth/request-code` endpoint | mitigate | `IDENTITY_DEV_MODE=true` returns the OTP `devCode` in the response body (designed for local smoke). Per D-13 default flipped to `false`; per RESEARCH §dev-mode-safety, prod-detection refuse-to-start fires when DEV_MODE=true + non-local DB URL. Defense-in-depth: existing compose-level `${VAR:?}` plus new Go-side `envRequire` plus new `isLocalDBURL` runtime check. |
| T-02-10 | Information Disclosure | service starts with empty `IDENTITY_JWT_SECRET` and signs predictable/empty-key JWTs | mitigate | `envRequire("IDENTITY_JWT_SECRET")` exits 1 if missing; `auth.NewSigner` already enforces ≥32 bytes (RESEARCH critical finding 1 — `services/backend/pkg/auth/jwt.go:43-46`). Belt-and-suspenders: compose `${JWT_SECRET:?}` at line 113 of docker-compose.prod.yml. |
| T-02-11 | Tampering | `EXPO_ACCESS_TOKEN` kept optional — an operator could deploy notifications service to prod with empty token and not notice push fanout silently no-ops | accept | RESEARCH analysis + PATTERNS.md confirm this is the intended v1.0 behavior matching compose `${EXPO_ACCESS_TOKEN:-}` empty-default. Phase 11/12 will populate the prod value when HEALTH-04 Strava push is wired. Operator awareness: notifications service logs `slog.Warn("push fanout disabled — EXPO_ACCESS_TOKEN empty")` on startup (add inline as part of Task 2 notifications wiring). |
| T-02-12 | Repudiation | audit-table coverage gap — a future secret-bearing env var added to a service but missed by the `envRequire` audit | mitigate | Plan 02-03 `.gitleaks.toml` flags `sk\.|pk\.` literals in NEW commits; the per-service main.go file headers (Pattern A) now annotate REQUIRED vs OPTIONAL — code review against this annotation catches drift. Phase 4 CI gitleaks adds backstop. |
| T-02-13 | Elevation of Privilege | accidental `IDENTITY_DEV_MODE=true` against a non-localhost staging DB that the operator thinks is "dev-equivalent" | mitigate | `isLocalDBURL` strictly tests for {localhost, 127.0.0.1, host.docker.internal, @postgres:} — staging Hetzner host names do NOT match, so service refuses to start. Per RESEARCH §Assumption A2, this errs conservative (the planner's intent: if you really need DEV_MODE on staging, the operator must explicitly set DB URL to one of the four allowlisted forms OR extend `isLocalDBURL` in a follow-up PR with a documented staging-host literal — surface decision rather than silent allow). |
| T-02-14 | Information Disclosure | `redactPassword` exists but ad-hoc `slog` calls might log raw `dbURL` elsewhere | accept | Existing code already uses `redactPassword(dbURL)` per PATTERNS.md verification; new DEV_MODE guard uses it too. Phase 5 OBS-04 (OTP log redaction + no PII in logs) is the broader audit gate. |
| T-02-15 | Spoofing | smoke_otp.py with stale `SMOKE_DEV_MODE=true` against new strict-mode identity service falsely reports "everything works" because relaxed assertions are still active | mitigate | D-14 flips smoke default to `false`; comment block updated to explicitly require opt-in for DEV mode. Test files in `services/backend/identity/internal/*_test.go` exercise strict-mode behavior; smoke is an integration check, not a unit test. |
</threat_model>

<verification>
- `gsd-sdk query verify.plan-structure` returns valid
- `cd services/backend && go build ./...` clean
- `cd services/backend && go test ./... -count=1 -race` all green
- `grep -rn 'envRequire' services/backend/*/cmd/server/main.go | wc -l` returns exactly 8 (one per service)
- `grep -n 'IDENTITY_DEV_MODE' services/backend/identity/cmd/server/main.go | grep '"false"'` matches line 50
- `grep -n 'SMOKE_DEV_MODE' services/backend/scripts/smoke_otp.py | grep '"false"'` matches line 28
- Smoke-style negative test: `cd services/backend/identity && unset IDENTITY_JWT_SECRET && timeout 5 go run ./cmd/server 2>&1 | grep -q 'required env var missing'`
- Smoke-style positive test: `cd services/backend/identity && IDENTITY_JWT_SECRET=$(openssl rand -hex 32) IDENTITY_DB_URL=postgres://re:pw@prod.example.com:5432/db IDENTITY_DEV_MODE=true timeout 5 go run ./cmd/server 2>&1 | grep -q 'REFUSING TO START'`
</verification>

<success_criteria>
SEC-05 closed: `IDENTITY_DEV_MODE=true` is no longer a possible production default; even if explicitly set, prod-detection blocks startup. CONCERNS.md P0 finding resolved.
SEC-06 closed: 12-factor split — every secret-bearing env var is sourced from process env (via SOPS-decrypted `.env` at deploy time, per 02-01 / 02-04). No hardcoded URLs/keys/tokens remain in service main.go files.
SEC-09 closed: every Go service fails fast on missing required secret env var; `envRequire` propagated across all 8 services per the audit table.

Notifications `EXPO_ACCESS_TOKEN` deliberately stays optional per RESEARCH note — documented decision, not an omission. Push fanout no-ops when empty until Phase 11/12 populates the prod value.
</success_criteria>

<output>
After completion, create `.planning/phases/02-secrets-and-config-hardening/02-02-SUMMARY.md` recording:
- Per-service: which `envOr` calls were converted to `envRequire`, with file:line citations
- Confirmation that `IDENTITY_DEV_MODE` default is `false` and the prod-detection guard refuses non-local DB URLs
- Confirmation that `pkg/auth.NewSigner` continues to enforce ≥32-byte JWT length (no `envRequireMinLen` wrapper added per RESEARCH critical finding 1)
- `EXPO_ACCESS_TOKEN` decision rationale (kept optional)
- Test count delta in identity service main_test.go (4 new test cases)
- Number of atomic commits (target: 1 for identity + 7 for other services + 1 for smoke_otp.py = 9 commits)
</output>
