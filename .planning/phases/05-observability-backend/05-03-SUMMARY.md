# 05-03-SUMMARY — slog JSON handler + PII deny-list + OBS-04 OTP fix + CI gate

**Plan:** 05-03 (Wave 2 — autonomous=true)
**Requirements:** OBS-03, OBS-04, OBS-06
**Executed:** 2026-05-19 (inline orchestrator after gsd-executor stalled on stream watchdog)
**Commits:** `6dfcef3`, `320975c`, `ea1e65d`
**Status:** ✅ Complete

---

## What landed

### Task 1 — `pkg/observability` package (commit `6dfcef3`)

New package `services/backend/pkg/observability/` — single source of truth for PII attribute redaction, shared by Plan 05-03 slog handler AND Plan 05-05 OTel span processor (D-21).

- **`pii_deny_list.go`** (102 lines) — `PIIDenyList` map[string]struct{} with 29 D-12 keys (OTP / phone / displayName / external_uuid / GPS / DM content / secrets). `EmailHashKeys` = `{"email"}` (hashed not dropped per D-10). Helpers: `IsDenied`, `ShouldHash`, `HashEmail` (SHA-256 first 8 hex).
- **`slog_handler.go`** (217 lines) — `NewSlogJSONHandler(Config)` returns a `*slog.Logger` with:
  - JSON output to `os.Stdout`
  - Per-record default attrs: `service`, `env`, `version`, `request_id` (always emitted — keeps Loki schema stable)
  - `piiScrubHandler.Handle` walks Attrs: drops `IsDenied` keys, hashes `ShouldHash` keys to `email_hash`
  - `WithAttrs` ALSO scrubs (persistent attrs go through same gate)
  - `WithLogLevel(ctx, level)` / `LogLevelFromContext` — per-request override seam used by Plan 05-06's DebugSessionMiddleware
  - `WithRequestID(ctx, id)` / `RequestIDFromContext` — middleware-attached request-id seam
  - `ParseLevel` fail-safe ENV decoder (empty/garbage → LevelInfo)
- **Tests** (400 lines / 47 sub-tests across `pii_deny_list_test.go` + `slog_handler_test.go`) — all 29 deny-list keys verified (case variants), email hashing determinism, default attrs, level override from context, WithAttrs persistence, ParseLevel cases. `go test -race ./pkg/observability/...` exits 0; `go vet` clean.

### Task 2 — D-13 OTP fix (commit `320975c`)

OBS-04 fix at `services/backend/identity/internal/service/otp.go:70-74`.

- Pre-fix: `slog.InfoContext(ctx, "otp issued", "email", email, "code", code)` — unconditional `code` leak in production. CONCERNS.md P0. Anyone with log read access → full account takeover.
- Post-fix: extracted into `logOTPIssued(ctx, email, code, devMode)` package-private helper:
  - `slog.InfoContext(ctx, "otp issued", "email", email)` — production path drops `code` entirely
  - `if devMode { slog.DebugContext(ctx, "otp dev-mode echo", "email", email, "code", code) }` — only emission of `code` is gated at TWO levels:
    1. Call-site: `if devMode`
    2. Handler: `LOG_LEVEL=info` baseline drops DebugContext; even at `LOG_LEVEL=debug` the `pkg/observability` PIIDenyList drops the `code` attr from output
- **Defense-in-depth chain verified** by `TestRequestCode_DevAndDebugLevel_HandlerStillScrubs`: with `devMode=true` + `LOG_LEVEL=debug` + the real `pkg/observability` scrub wrapper, the DebugContext message text emits but the `code` attr is dropped.
- 3 new tests in `otp_test.go` (208 lines): `TestRequestCode_ProdNoLeak`, `TestRequestCode_DevButInfoLevel`, `TestRequestCode_DevAndDebugLevel_HandlerStillScrubs`. All green.
- Grep self-check: `grep -nE 'slog\.\w+Context\([^)]*"code"' otp.go` returns exactly 1 match (the gated DebugContext).

### Task 3 — wire 8 services + CI pii-audit gate (commit `ea1e65d`)

- **8 services wired** (`identity`, `activity-sync`, `feed`, `media`, `messaging`, `notifications`, `realtime-gw`, `social-graph`) — each `cmd/server/main.go` now uses `observability.NewSlogJSONHandler(observability.Config{ServiceName: "<svc>", Env: envOr("ENV","prod"), Version: envOr("BUILD_VERSION","dev"), Level: observability.ParseLevel(envOr("LOG_LEVEL","info"))})`. ServiceName hardcoded per service (same value used as Sentry `setTag("service", ...)` in Plan 05-05).
- **`scripts/pii_audit.sh`** (62 lines) — bash grep over `services/backend/` for `slog.*Context` calls using any of the 29 D-12 deny-list keys. Allowlists the gated D-13 DebugContext line in `otp.go`. Exits 0 on current tree.
- **`.github/workflows/backend-ci.yml`** — new `pii-audit` job runs `scripts/pii_audit.sh` on every PR.
- **`scripts/setup-branch-protection.sh`** — required-checks list extended 8 → 9 entries (`"PII Audit (slog grep)"` appended). Blocks merge if the audit fails.
- `go build ./...` succeeds for all 8 service modules.

---

## Deviations from plan

1. **8 services wired, not 9.** Plan text said "8 services + gateway"; gateway is the Caddy reverse-proxy (Caddyfile-based, not a Go service) — not wireable. `files_modified` lists `gateway/cmd/server/main.go` which doesn't exist. Recorded here; no remediation needed. Plans 05-04, 05-05, 05-06 already wire only the 8 Go services (verified by inspecting their `files_modified` blocks; `gateway/cmd/server/main.go` references in those plans should similarly be ignored — surface this finding in 05-04 / 05-05 / 05-06 SUMMARYs when they execute).

2. **Executor change: inline foreground instead of background gsd-executor agent.** The first attempt (background `Agent(subagent_type=gsd-executor)`) stalled at Task 1 RED phase — pattern in this session: long-form Go code generation reliably trips the stream watchdog ~10 min in. Switched to inline orchestrator execution (own Read/Write/Edit/Bash tool calls). No watchdog constraint on direct tool calls. Trade-off: orchestrator context grew by ~3-4 commit cycles worth, but all 3 tasks landed reliably.

3. **`sixDigitRe` regex too greedy for test assertions** — slog's RFC3339 timestamp field contains microseconds like `.191691+03:00` which matched `\b\d{6}\b`. Switched to specific-value `assertNoCodeLeak` helper that checks for the literal OTP code strings used in tests (`424242`, `987654`, `111222`). Functional equivalence preserved; lower false-positive risk.

4. **Extracted `logOTPIssued` helper** — to enable unit-testing of call-shape without standing up Postgres (existing `*postgres.OtpRepo` concrete dep on `OtpService` would have forced either heavyweight integration test or interface refactor). Helper is a 1:1 transcription of the post-fix call shape; production and tests exercise the same code path.

---

## Acceptance criteria verification

From plan `<verification>` block:

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `go test -race ./services/backend/pkg/observability/...` exits 0 | ✅ |
| 2 | `go test -race ./services/backend/identity/internal/service/... -run "TestRequestCode_"` exits 0 | ✅ |
| 3 | `go build ./...` from `services/backend/` succeeds (per-module — workspace lacks `./...` glob) | ✅ |
| 4 | `bash scripts/pii_audit.sh` exits 0 | ✅ |
| 5 | Synthetic emit produces stdout JSON with `service`, `env`, `version` attrs | ☐ (deferred — needs ENV setup; covered by unit tests instead) |
| 6 | CI `pii-audit` job in `backend-ci.yml` + in branch protection required-checks | ✅ |
| 7 | `grep -nE 'slog\.\w+Context\([^)]*"code"' otp.go` returns exactly one match | ✅ (the gated DebugContext per D-13) |

---

## File inventory

```
NEW:
  services/backend/pkg/observability/pii_deny_list.go              102 lines
  services/backend/pkg/observability/pii_deny_list_test.go         117 lines
  services/backend/pkg/observability/slog_handler.go               217 lines
  services/backend/pkg/observability/slog_handler_test.go          283 lines
  services/backend/identity/internal/service/otp_test.go           208 lines
  scripts/pii_audit.sh                                              62 lines

MODIFIED:
  services/backend/identity/internal/service/otp.go                +24 lines (D-13 fix + helper)
  services/backend/identity/cmd/server/main.go                     +8/-1 lines
  services/backend/activity-sync/cmd/server/main.go                +8/-1 lines
  services/backend/feed/cmd/server/main.go                         +8/-1 lines
  services/backend/media/cmd/server/main.go                        +8/-1 lines
  services/backend/messaging/cmd/server/main.go                    +8/-1 lines
  services/backend/notifications/cmd/server/main.go                +8/-1 lines
  services/backend/realtime-gw/cmd/server/main.go                  +8/-1 lines
  services/backend/social-graph/cmd/server/main.go                 +8/-1 lines
  .github/workflows/backend-ci.yml                                 +11 lines (pii-audit job)
  scripts/setup-branch-protection.sh                               +2/-1 lines (9th required check)
```

Total: 989 new lines, ~85 modified lines, 3 atomic commits.

---

## Unblocks

- **Plan 05-05** (Wave 3) — `pkg/observability/otel_init.go` + `sentry_init.go` will import `PIIDenyList` from this plan's `pii_deny_list.go` (D-21 single source of truth)
- **Plan 05-06** (Wave 4) — `pkg/observability/debug_session_middleware.go` will use `WithLogLevel` / `LogLevelFromContext` from this plan's `slog_handler.go`

## Carry-forward notes for Phase 5 closeout SUMMARY

- D-32 main.go bootstrap pattern lands incrementally: Plan 05-03 ships the slog seam; Plans 05-04 / 05-05 / 05-06 add the other 4 middleware layers (Promhttp, OtelHTTP, SentryRecovery, DebugSession). Each subsequent plan re-touches the 8 services' main.go files.
- The "9th service" misclassification (gateway as Go service) should be corrected in CONTEXT.md `<code_context>` at phase closeout — services count is 8 throughout backend.
- OBS-06 has a runtime probe component (`pii_live_probe.py` in Plan 05-06) that's not yet wired. This plan closes the **CI grep** half of OBS-06; the runtime sampling half lands in 05-06.

---

*Plan: 05-03 — slog JSON handler + PII deny-list + OBS-04 OTP fix + CI gate*
*Phase: 05-observability-backend*
*Executed: 2026-05-19*
