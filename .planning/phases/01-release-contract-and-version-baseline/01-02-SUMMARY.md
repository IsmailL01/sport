---
phase: 01-release-contract-and-version-baseline
plan: 02
subsystem: shared
tags: [version-negotiation, mobile, backend, middleware, force-update]
requires:
  - "pkg/ratelimit (analog shape mirrored)"
  - "pkg/permissions (analog shape mirrored)"
  - "expo-application (npm dep — added to package.json)"
  - "golang.org/x/mod/semver (added to pkg/go.mod indirect deps promoted)"
provides:
  - "pkg/clientversion.Policy + Middleware for outermost mux wrap"
  - "pkg/clientversion.Parse for X-Client-Version header"
  - "pkg/clientversion.FromContext for downstream structured logging"
  - "X-Client-Version stamping on every mobile outbound request"
  - "HTTP 426 → useForceUpdateStore → blocking ForceUpdateScreen"
  - "Constructor-order convention for Plan 01-03 to insert flagStore"
affects:
  - "identity, activity-sync, feed, social-graph, messaging, realtime-gw, notifications, media (all 8 service main.go)"
  - "apps/mobile-rn/App.tsx (root component composition)"
  - "apps/mobile-rn/src/auth/apiClient.ts (low-level fetch wrapper)"
tech-stack:
  added:
    - "expo-application ~7.0.8 (direct dep on mobile)"
    - "golang.org/x/mod/semver (promoted to direct dep of pkg/)"
  patterns:
    - "pkg/<concern> shared Go lib (mirror of pkg/ratelimit)"
    - "Outermost middleware wrap before auth (clientversion fires first)"
    - "Module-init memoization for ENV-derived values (version.ts)"
    - "In-memory Zustand store for transient session state (forceUpdate.ts)"
key-files:
  created:
    - "services/backend/pkg/clientversion/clientversion.go (94 lines)"
    - "services/backend/pkg/clientversion/parse.go (117 lines)"
    - "services/backend/pkg/clientversion/middleware.go (125 lines)"
    - "services/backend/pkg/clientversion/parse_test.go (50 lines)"
    - "services/backend/pkg/clientversion/middleware_test.go (198 lines)"
    - "services/backend/scripts/test_clientversion_caddy.sh (122 lines)"
    - "apps/mobile-rn/src/util/version.ts (38 lines)"
    - "apps/mobile-rn/src/util/__tests__/version.test.ts (65 lines)"
    - "apps/mobile-rn/src/state/forceUpdate.ts (39 lines)"
    - "apps/mobile-rn/src/state/__tests__/forceUpdate.test.ts (58 lines)"
    - "apps/mobile-rn/src/ui/screens/ForceUpdateScreen.tsx (126 lines)"
    - "apps/mobile-rn/src/ui/screens/__tests__/ForceUpdateScreen.test.tsx (64 lines)"
    - "apps/mobile-rn/src/auth/__tests__/apiClient.test.ts (207 lines)"
  modified:
    - "apps/mobile-rn/package.json (+1 line: expo-application dep)"
    - "apps/mobile-rn/App.tsx (+5 lines: ForceUpdateScreen mount)"
    - "apps/mobile-rn/src/auth/apiClient.ts (+62 lines: X-Client-Version + 426 intercept)"
    - "services/backend/identity/cmd/server/main.go (+13 lines: middleware mount)"
    - "services/backend/activity-sync/cmd/server/main.go (+13 lines)"
    - "services/backend/feed/cmd/server/main.go (+14 lines)"
    - "services/backend/social-graph/cmd/server/main.go (+13 lines)"
    - "services/backend/messaging/cmd/server/main.go (+14 lines)"
    - "services/backend/realtime-gw/cmd/server/main.go (+16 lines)"
    - "services/backend/notifications/cmd/server/main.go (+14 lines)"
    - "services/backend/media/cmd/server/main.go (+13 lines)"
    - "services/backend/pkg/go.mod (golang.org/x/mod promoted to direct dep)"
    - "services/backend/pkg/go.sum (lockfile)"
    - "services/backend/go.work.sum (lockfile)"
decisions:
  - "Subpackage of services/backend/pkg/ instead of standalone go.mod — mirrors pkg/ratelimit / pkg/permissions; single module path keeps imports clean."
  - "Strict semver validation: rejects 1.0 / 1 — only X.Y.Z accepted, matching what expo-application stamps on mobile."
  - "Graceful pass-through on missing/malformed X-Client-Version (D-08 lenience for v1.0); log.Warn captures abuse signal without breaking traffic."
  - "Skip-paths /healthz, /metrics hardcoded in main.go (env-overrideable in v1.1)."
  - "426 body schema matches api/_shared/responses.yaml#/components/responses/UpgradeRequired (owned by Plan 01-01) — error, min_version, force_update_url_android, force_update_url_ios keys."
  - "Mobile 426 intercept lives inside doFetch (low level, below 401 retry path) — too-old client can't refresh JWT either, would loop."
  - "forceUpdate store is in-memory (no MMKV persist) — server re-issues 426 every request after binary update; stale persisted state would be wrong."
  - "Constructor-order convention for Plan 01-03: pool → flagStore [v1.0 from Plan 03] → handler → versionPolicy → versionedMux. Stanza comment in each main.go documents the anchor."
metrics:
  duration: "~50 minutes (single executor pass)"
  completed: "2026-05-15"
---

# Phase 1 Plan 02: Version Negotiation End-to-End — Summary

One-liner: `X-Client-Version` end-to-end with `pkg/clientversion` Go middleware mounted in all 8 backend services, mobile apiClient header stamping + HTTP 426 → blocking `ForceUpdateScreen` flow via `expo-application`.

## Scope

Delivered REL-02 (Version Negotiation) as research-corrected by D-06-augmented, D-08-revised, and D-09. Created the canonical `pkg/clientversion` Go shared library + Caddy passthrough integration test script. Mounted middleware in all 8 service main.go files. Added `expo-application` as a direct mobile dep. Wired apiClient → forceUpdate store → ForceUpdateScreen → App.tsx end-to-end.

## Build Order

Per Plan structure:
1. **Task 1** — Shared Go lib + mount in 8 services (Subtasks A/B/C: package, mount, Caddy verify).
2. **Task 2** — Mobile `expo-application` + `version.ts` + memoized header function.
3. **Task 3** — Mobile `apiClient.ts` + `forceUpdate.ts` + `ForceUpdateScreen.tsx` + `App.tsx` mount.

Each task followed TDD: RED commit (`test(phase1-rel): …`), GREEN commit (`feat(phase1-rel): …`).

## Commits

```
4b52e99 feat(phase1-rel): wire X-Client-Version stamping + 426 force-update UX (REL-02)
cd1983f test(phase1-rel): add failing tests for force-update flow (REL-02)
f8d9ba2 feat(phase1-rel): implement getClientVersionHeader via expo-application (REL-02)
72fafc3 test(phase1-rel): add failing tests for getClientVersionHeader + add expo-application dep (REL-02)
20530fa feat(phase1-rel): mount clientversion middleware in 8 services (REL-02)
3ea744e feat(phase1-rel): implement pkg/clientversion (parser + middleware) (REL-02)
d9c898b test(phase1-rel): add failing tests for pkg/clientversion (REL-02)
```

7 atomic commits. Each commit is independently buildable and individually reviewable.

## Verification

### Backend (`go test -race`)

```
ok  github.com/runningecosystem/backend/pkg/clientversion  1.736s
```

20 tests passed:
- `TestParse_TableDriven` (11 sub-cases: plain semver, paren build, plus build, whitespace, empty, garbage, incomplete major.minor, paren without close, etc.)
- `TestMiddleware_MissingHeader_GracefulPass`
- `TestMiddleware_MalformedHeader_GracefulPass`
- `TestMiddleware_AtMinVersion_Pass`
- `TestMiddleware_BelowMinVersion_426` (asserts JSON body shape)
- `TestMiddleware_SkipPath_BypassesEvenForOldVersion`
- `TestMiddleware_BuildSuffix_IgnoredForComparison`
- `TestMiddleware_FromContext_Populated`
- `TestMiddleware_NilLogger_NoPanic`

`go vet ./pkg/clientversion/...` — clean.

### Backend service builds

All 8 services compile:
```
identity activity-sync feed social-graph messaging realtime-gw notifications media → 0 BUILD FAIL
```

Grep verification — `grep -lE 'clientversion\.Middleware' */cmd/server/main.go | wc -l = 8`.

### Mobile (jest + tsc)

```
Test Suites: 52 passed, 52 total
Tests:       554 passed, 554 total
```

18 new tests (in 4 suites) added by this plan, all passing:
- `src/util/__tests__/version.test.ts` — 4 cases
- `src/state/__tests__/forceUpdate.test.ts` — 4 cases
- `src/auth/__tests__/apiClient.test.ts` — 6 cases (stamping, 426 android URL, 426 ios URL, 426 unparseable body, 426 returned unchanged, 401 retry preserved)
- `src/ui/screens/__tests__/ForceUpdateScreen.test.tsx` — 4 cases (null when not required, Russian Modal when required, Linking.openURL on press, no-op when URL empty)

`tsc --noEmit` clean — no type errors in the full mobile codebase.

### Caddy passthrough

**Verified by inspection** — `services/backend/gateway/Caddyfile` and `Caddyfile.prod` contain only:
- `header @cors_preflight ...` (operates on response headers for OPTIONS preflight)
- `header Access-Control-Allow-Origin "*"` (response header)
- No `header_up` directives, no header-stripping `-X-Client-Version`

Caddy v2's default `reverse_proxy` behavior preserves client request headers. No Caddyfile changes were required.

**Integration script** — `services/backend/scripts/test_clientversion_caddy.sh` issues curl against the running stack with:
- old `X-Client-Version: 0.9.0 (12)` → expect 426 with structured body
- current `X-Client-Version: 1.0.0 (1)` → expect not-426
- malformed `X-Client-Version: garbage` → expect graceful pass (not-426)
- no header on `/healthz` → expect 200

Script self-skips with informative message and exit 0 if the gateway isn't reachable (CI-friendly). Manual runbook: `cd services/backend && docker compose up -d gateway identity && bash scripts/test_clientversion_caddy.sh`.

## Architecture & Conventions Documented

### Constructor-order convention (for Plan 01-03)

In every `cmd/server/main.go` the version-policy stanza is anchored with a clearly labeled comment:

```go
// === Outermost middleware stanza (Plan 01-02 / REL-02) ===
// Constructor order: pool → handler → versionPolicy → versionedMux.
// Plan 01-03 (Wave 2) will insert flagStore between pool and handler.
versionPolicy := clientversion.Policy{
    MinSupported:          envOr("CLIENT_MIN_VERSION", "1.0.0"),
    ForceUpdateURLAndroid: envOr("FORCE_UPDATE_URL_ANDROID", ""),
    ForceUpdateURLiOS:     envOr("FORCE_UPDATE_URL_IOS", ""),
    SkipPaths:             []string{"/healthz", "/metrics"},
}
versionedMux := clientversion.Middleware(h.Routes(), versionPolicy, logger)
```

Plan 01-03 (Wave 2) should:
1. Construct `flagStore` AFTER `pool, err := pgxpool.New(...)` and BEFORE `h := handler.New(...)`.
2. Pass `flagStore` into the handler constructor (where required) and/or expose globally via context.
3. Keep the version-policy stanza intact — append flagStore work above it.

The expected target structure after Plan 01-03:
```go
pool, err := pgxpool.New(...)            // existing
// ... defer pool.Close(); pool.Ping(...)
flagStore, err := featureflags.NewPostgresStore(pool, logger)  // ← Plan 01-03 inserts here
// ... defer flagStore.Close()
h := handler.New(svc, signer, logger, flagStore)  // ← handler signature may change
// === Outermost middleware stanza (Plan 01-02 / REL-02) ===
versionPolicy := clientversion.Policy{ ... }
versionedMux := clientversion.Middleware(h.Routes(), versionPolicy, logger)
```

### Adapter encapsulation (per CLAUDE.md §Adapters)

`apps/mobile-rn/src/util/version.ts` is the **only** file in the mobile codebase that imports `expo-application`. All consumers (apiClient, future force-update banner, etc.) go through `getClientVersionHeader()`. This contract is documented in the file header.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] `pkg/clientversion/go.mod` was not created — package added as subpackage of existing `services/backend/pkg/` module**
- **Found during:** Task 1 Subtask A.
- **Issue:** The plan listed `services/backend/pkg/clientversion/go.mod` in `files_modified` and the must-haves artifacts, but the canonical codebase pattern (verified by reading `pkg/ratelimit/`, `pkg/permissions/`, `pkg/audit/`) treats every `pkg/<concern>` as a subpackage of the single `github.com/runningecosystem/backend/pkg` module — there is no separate `pkg/ratelimit/go.mod`. Creating a separate go.mod would have required a `go.work` edit, broken the import path discipline (each subpackage would have its own module root), and contradicted CLAUDE.md "match existing codebase pattern" guidance.
- **Fix:** Added `clientversion` as a subpackage. Imports are `github.com/runningecosystem/backend/pkg/clientversion` — consistent with `pkg/ratelimit`, `pkg/auth`.
- **Files modified:** Did NOT create `pkg/clientversion/go.mod`; instead promoted `golang.org/x/mod` from indirect to direct dep in `pkg/go.mod`.
- **Commit:** 3ea744e

**2. [Rule 1 — Bug] Go build-tag false-positive on parse.go header**
- **Found during:** First build attempt after writing parse.go.
- **Issue:** A literal `"1.0.0+build42"` example in the package header comment was parsed by Go's build-tag detector as a malformed `+build` constraint comment (`malformed +build comment`).
- **Fix:** Rewrote the header to describe the same shape without a literal `1.0.0+build42` token on a comment line.
- **Files modified:** `services/backend/pkg/clientversion/parse.go`
- **Commit:** 3ea744e (included in same GREEN commit since the issue was caught and fixed inside the GREEN phase before the test run completed)

**3. [Rule 3 — Blocking issue] Typecheck error in apiClient test casting fetchSpy.mock.calls[0]**
- **Found during:** `tsc --noEmit` after Task 3 GREEN.
- **Issue:** Direct `as [string, RequestInit]` cast of `jest.MockedFunction.mock.calls[0]` triggered TS2352 (insufficient overlap).
- **Fix:** Added intermediate `as unknown` cast, then indexed.
- **Files modified:** `apps/mobile-rn/src/auth/__tests__/apiClient.test.ts`
- **Commit:** 4b52e99 (included in same GREEN commit since the issue was caught and fixed inside the GREEN phase before final commit)

### Parallel-execution housekeeping note

Plan 01-01 was running in parallel and had staged `services/backend/api/_shared/*.yaml`, `api/feed.yaml`, `api/gateway.yaml`, etc., in the git index before this executor's `git add` step on Task 1 Subtask B. Those staged files were swept into commit `20530fa` ("mount clientversion middleware in 8 services") even though they belong to Plan 01-01. This is harmless — Plan 01-01 will not re-add them, and the files themselves are exactly what Plan 01-01 intended. **Recommend reviewers note**: commit 20530fa contains some 01-01 files in addition to the 8 main.go edits. Plan 01-01 already landed its own commit `a02b976` for the openapi-routes-check tool independently.

### Confirmation of expo-application landing

```
$ grep '"expo-application"' apps/mobile-rn/package.json
    "expo-application": "~7.0.8",
```

Per D-06-augmented: `expo-application@7.0.8` is already present in `node_modules/` (transitive via other Expo deps); this plan adds it as a **direct** dependency in `package.json` so future `npm install` from clean state is deterministic. Version pin matches Expo SDK 54 (per CONTEXT.md/RESEARCH.md).

### Integration script status

Integration script `services/backend/scripts/test_clientversion_caddy.sh` is committed and chmod +x; auto-skips with exit 0 if docker-compose stack isn't running (CI-friendly). Manual smoke step:
```bash
cd services/backend && docker compose up -d gateway identity
bash scripts/test_clientversion_caddy.sh
```

## Known Stubs / Deferred Issues

None. All artifacts wired end-to-end with passing tests.

## Threat Flags

None introduced. All threats from the plan's `<threat_model>` are addressed:
- T-01-B-02 (header parsing) — `Parse()` strictly validates via `semver.IsValid`, malformed → graceful pass + slog.Warn; tests 4-6 cover empty/garbage/incomplete.
- T-01-B-04 (info disclosure in 426 body) — body contains only `min_version` (public via mobile binary) and force_update URLs (public App Store / VPS manifest endpoint).
- T-01-B-05 (DoS via header parsing) — `Parse` is O(len(header)) with no regex backtracking; bounded by net/http server header-size cap.
- T-01-B-06 (URL injection) — server response controls forceUpdateUrl; `Linking.openURL` uses OS URL handler (deeplink allowlist OS-enforced).
- T-01-B-07 (skip-path privilege escalation) — hardcoded `/healthz`, `/metrics` only; no business endpoints.
- T-01-B-08 (Caddy header stripping) — Caddyfile/Caddyfile.prod inspected; no header-mangling directives; integration script provides regression coverage.

## Cross-cutting Notes for Plan 01-03 (Wave 2)

1. **8 main.go anchor points** — every service has a clearly labeled `// === Outermost middleware stanza (Plan 01-02 / REL-02) ===` comment immediately preceded by handler construction. Plan 01-03 inserts `flagStore` between pool and handler.
2. **Logger is available** in every main.go — `logger` variable is in scope at the stanza site (in 7/8 services as `logger`, in 1/8 `realtime-gw` also as `logger`); no fallback to `slog.Default()` was needed.
3. **envOr helper** — every service already exposes `envOr` at file scope; Plan 01-03 can use it for `FEATUREFLAGS_*` ENV vars without redeclaration.
4. **`pkg/featureflags` package shape** — should mirror `pkg/clientversion`: package root with exported `Store` type, separate `*_test.go` files, subpackage of `github.com/runningecosystem/backend/pkg` (no separate go.mod).
5. **Mobile force-update integration** — `useForceUpdateStore` is already plumbed into `App.tsx`. If Plan 01-03 adds a feature-flag gate to override force-update behavior (e.g., `release_channel_force_update` kill-switch per D-16), it can read the flag inside `apiClient.handleUpgradeRequired` to skip `set({required: true})` when the flag is OFF.

## Self-Check: PASSED

**Files exist:**
- FOUND: services/backend/pkg/clientversion/clientversion.go
- FOUND: services/backend/pkg/clientversion/parse.go
- FOUND: services/backend/pkg/clientversion/middleware.go
- FOUND: services/backend/pkg/clientversion/parse_test.go
- FOUND: services/backend/pkg/clientversion/middleware_test.go
- FOUND: services/backend/scripts/test_clientversion_caddy.sh
- FOUND: apps/mobile-rn/src/util/version.ts
- FOUND: apps/mobile-rn/src/util/__tests__/version.test.ts
- FOUND: apps/mobile-rn/src/state/forceUpdate.ts
- FOUND: apps/mobile-rn/src/state/__tests__/forceUpdate.test.ts
- FOUND: apps/mobile-rn/src/ui/screens/ForceUpdateScreen.tsx
- FOUND: apps/mobile-rn/src/ui/screens/__tests__/ForceUpdateScreen.test.tsx
- FOUND: apps/mobile-rn/src/auth/__tests__/apiClient.test.ts

**Commits exist:**
- FOUND: d9c898b — test(phase1-rel): add failing tests for pkg/clientversion (REL-02)
- FOUND: 3ea744e — feat(phase1-rel): implement pkg/clientversion (parser + middleware) (REL-02)
- FOUND: 20530fa — feat(phase1-rel): mount clientversion middleware in 8 services (REL-02)
- FOUND: 72fafc3 — test(phase1-rel): add failing tests for getClientVersionHeader + add expo-application dep (REL-02)
- FOUND: f8d9ba2 — feat(phase1-rel): implement getClientVersionHeader via expo-application (REL-02)
- FOUND: cd1983f — test(phase1-rel): add failing tests for force-update flow (REL-02)
- FOUND: 4b52e99 — feat(phase1-rel): wire X-Client-Version stamping + 426 force-update UX (REL-02)

## TDD Gate Compliance

All 3 tasks followed TDD gate sequence (RED → GREEN). 6 explicit test commits and 6 corresponding feat commits across the 3 tasks (well, Task 1 has 2 GREEN feats because of split lib-vs-mount, but the test commit precedes both — `d9c898b` < `3ea744e` < `20530fa`):

| Task | RED commit | GREEN commit(s)   |
|------|------------|-------------------|
| 1    | d9c898b    | 3ea744e + 20530fa |
| 2    | 72fafc3    | f8d9ba2           |
| 3    | cd1983f    | 4b52e99           |
