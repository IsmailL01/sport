---
phase: 01-validate-close-territory-core
plan: 01
subsystem: domain/session + storage + state/activity
tags: [refactor, god-store-split, real-sqlite-test, pure-domain]
requires: [PHASE1-07]
provides:
  - "pure SessionManager class with start/stop/markLap/acceptPoint/ingestRawPoint/recoverLast/snapshot"
  - "SessionRepo interface (storage seam)"
  - "real-SQLite integration test harness via better-sqlite3 shim (Pitfall 8 fallback)"
  - "_setDatabase + runMigrations test hooks in storage/database.ts"
affects:
  - "src/state/activity.ts (god-store reduced 466 → 378 LOC)"
  - "src/storage/database.ts (added _setDatabase + runMigrations exports)"
  - "apps/mobile-rn/package.json (added better-sqlite3 + @types/better-sqlite3 devDeps)"
tech-stack:
  added:
    - "better-sqlite3@12.10.0 (devDep, --save-exact, Jest fallback for expo-sqlite)"
    - "@types/better-sqlite3@7.6.13 (devDep)"
  patterns:
    - "Pure-domain lifecycle class with injected SessionRepo + onChange callback"
    - "Jest manual mock at <rootDir>/__mocks__ (auto-applies to node_modules import)"
    - "_setDatabase test hook for in-memory SQLite swap per test"
key-files:
  created:
    - apps/mobile-rn/__mocks__/expo-sqlite.ts
    - apps/mobile-rn/src/__tests__/expoSqlite.probe.test.ts
    - apps/mobile-rn/src/__tests__/SessionManager.test.ts
    - apps/mobile-rn/src/__tests__/sessionRepository.integration.test.ts
    - apps/mobile-rn/src/domain/session/SessionManager.ts
    - apps/mobile-rn/src/domain/session/__tests__/SessionManager.smoke.test.ts
  modified:
    - apps/mobile-rn/src/state/activity.ts (466 → 378 LOC, -19%)
    - apps/mobile-rn/src/storage/database.ts (added _setDatabase + runMigrations exports)
    - apps/mobile-rn/package.json (devDeps)
    - apps/mobile-rn/package-lock.json
decisions:
  - "probe_outcome=red — expo-sqlite cannot be imported under jest-expo (expo-asset missing). Fell back to better-sqlite3 shim per RESEARCH.md Pitfall 8."
  - "Jest mock dir moved from src/__mocks__/ (plan) to apps/mobile-rn/__mocks__/ (Jest convention for node_modules manual mocks) — Rule 3 deviation."
  - "wallet/records/calories orchestration stays in wrapper (state/activity.ts) as `postStopEnrich`, NOT in SessionManager — they depend on zustand stores. Phase B (D-09 follow-up) can lift into a dedicated orchestrator."
  - "SessionRepo.finalizeSession.calcMethod typed as CalcMethod union (not 'string | null') to be type-compatible with the existing repo signature."
metrics:
  duration: 21m
  completed: 2026-05-14
---

# Phase 1 Plan 01: SessionManager refactor + real-SQLite tests — Summary

**One-liner:** Extracted pure-domain `SessionManager` from the 466-line `state/activity.ts` god-store and added real-SQLite integration tests for `sessionRepository` via a `better-sqlite3` Jest shim (probe outcome RED for `expo-sqlite` under `jest-expo`).

**probe_outcome: red** *(downstream Plans 07 and 10 read this verbatim)*

## Probe Test Outcome (Task 1)

Direct `import * as SQLite from 'expo-sqlite'` under `jest-expo@~54.0.0` throws:
```
Cannot find module 'expo-asset' from 'node_modules/expo-sqlite/build/hooks.js'
```

Root cause: `expo-sqlite@16.0.10`'s `hooks.tsx` imports `expo-asset`, which is **not** in the project's `devDependencies` and is only useful for bundling a SQLite database file as an asset (a feature this codebase never uses).

**Fallback path taken (RESEARCH.md §Pitfall 8):**
- Installed `better-sqlite3@12.10.0` as `--save-exact` devDep (ABI reproducibility per threat-register T-01-01-01)
- Installed `@types/better-sqlite3@7.6.13` for `tsc --noEmit` to remain clean
- Created `apps/mobile-rn/__mocks__/expo-sqlite.ts` — a 93-line Jest manual-mock that re-implements the **sync API surface actually used** by `src/storage/*.ts`:
  - `openDatabaseSync` → `new Database(name)`
  - `execSync(sql)` → `db.exec(sql)`
  - `runSync(sql, params?)` → prepared statement `.run(...)`
  - `getFirstSync<T>` / `getAllSync<T>` → `.get` / `.all` with row-type cast
  - `prepareSync(sql).executeSync(params?)` / `.finalizeSync()` (no-op — `better-sqlite3` doesn't require explicit finalize)
  - `withTransactionSync(fn)` → `db.transaction(fn)()`
  - Strips `$` prefix from named-param keys (e.g. `{ $sid: 1 }` → `{ sid: 1 }`) because `better-sqlite3` binds named params without the prefix sigil.

## Tasks Completed (4 / 4)

| Task | Name | Commit |
|------|------|--------|
| 1 | Probe expo-sqlite + install better-sqlite3 shim | `a7da532` |
| 2 | Extract SessionManager pure-domain class with 20 unit/smoke tests | `16527f0` |
| 3 | Real-SQLite integration tests for sessionRepository (5 cases) | `a9b5857` |
| 4 | Wire SessionManager into useActivityStore via delegation | `aaae232` |

## SessionManager LOC + god-store reduction

| File | Before | After | Δ |
|---|--------:|-------:|--:|
| `src/state/activity.ts` (god-store) | 466 | 378 | **−88 LOC (−19%)** |
| `src/domain/session/SessionManager.ts` (NEW) | — | 422 | +422 LOC |

**Note on reduction:** Plan target was `<250 LOC` for the wrapper. Final `378` is above target — the `postStopEnrich()` helper (calories + wallet award + personal-records detection) **must stay in the wrapper** because it depends on three zustand stores (`useSettingsStore.athlete`, `useAuthStore.user`, `useWalletStore.awardForSession`) which cannot be imported into pure-domain `SessionManager.ts`. This is the explicit D-09 Phase A scope. Phase B (a follow-up plan) can lift the orchestration into a dedicated module if further size reduction is needed. See "Surprises / Deviations" below.

## Test Counts

| Stage | Suites | Tests |
|-------|-------:|------:|
| Baseline (pre-Task-1) | 32 | 435 |
| After Task 1 (probe + shim) | 38 | 464 |
| After Task 2 (SessionManager) | 40 | 484 |
| After Task 3 (integration tests) | **41** | **489** |
| After Task 4 (wrapper refactor) | 41 | 489 |

**Net new tests in this plan: +54 tests / +9 suites.** The jump from 32→38 suites between baseline and Task 1 is because **other parallel-wave plans (PHASE1-06 hooks, PHASE1-10 offline)** committed their own test files concurrently and those tests transitively import `expo-sqlite` via the activity-store chain — the shim made them runnable for the first time. The SessionManager + integration test suites I added are 2 of those 9.

- `expoSqlite.probe.test.ts` — 1 test
- `SessionManager.test.ts` — 19 tests (8 listed in plan `<behavior>` + 11 supplementary covering activity-type variants, reset, error handling)
- `SessionManager.smoke.test.ts` (co-located in `src/domain/session/__tests__/`) — 1 test
- `sessionRepository.integration.test.ts` — 5 tests (migrations sanity, crash-recovery, finalize seal, activity-type roundtrip, deleteSession atomicity)

## Conditional artifacts (Task 1 fallback path triggered)

Since `probe_outcome=red`, the conditional artifacts declared in the plan's `files_modified` were created:

- ✓ `apps/mobile-rn/__mocks__/expo-sqlite.ts` (at package root, not `src/__mocks__/` — see Surprises)
- ✓ `apps/mobile-rn/package.json` (added `better-sqlite3@12.10.0` + `@types/better-sqlite3@7.6.13` to `devDependencies`)
- ✓ `apps/mobile-rn/package-lock.json` (regenerated by `npm install`)

## Verification

- `cd apps/mobile-rn && npm test` → **41 suites / 489 tests passing** ✓
- `cd apps/mobile-rn && npm run typecheck` → clean ✓
- `cd apps/mobile-rn && npm run lint` → **0 errors**, 55 warnings (all pre-existing — none introduced by new files) ✓
- Forbidden-import grep: `grep -E "(rnmapbox|expo-sqlite|expo-location|expo-haptics|zustand)" apps/mobile-rn/src/domain/session/SessionManager.ts` → only comment matches, **no actual import statements** ✓

## Surprises / Deviations

### Deviation 1 — Rule 3 (blocking): Jest mock directory location
**Found during:** Task 1 (probe outcome RED).
**Issue:** Plan listed `apps/mobile-rn/src/__mocks__/expo-sqlite.ts` for the shim. Jest's manual-mock convention for node_modules modules requires the `__mocks__` directory at the **package root** (adjacent to `node_modules`), otherwise the mock is not auto-applied without explicit `jest.mock('expo-sqlite')` calls in every test file.
**Fix:** Moved shim to `apps/mobile-rn/__mocks__/expo-sqlite.ts`. Auto-mock now works for **all** test files importing `expo-sqlite` without per-test boilerplate (essential for `sessionRepository.integration.test.ts` and for other parallel-plan tests that transitively import the storage layer).
**Files modified:** `apps/mobile-rn/__mocks__/expo-sqlite.ts` (NEW, at root, not `src/__mocks__/`).
**Commits:** `a7da532`.

### Deviation 2 — Rule 4-adjacent (deferred to Phase B): post-stop orchestration kept in wrapper
**Found during:** Task 2 (designing SessionManager API).
**Issue:** PATTERNS.md line 75 says `stop()` should "compute distance/area/HR/calories/records via injected dependencies". But calories require `useSettingsStore.athlete`, wallet award requires `useAuthStore.user` + `useWalletStore.awardForSession`, and personal records require `recordsRepository` (storage layer) + `points` array. Folding all of these into `SessionManager` would either (a) violate pure-domain layering by importing zustand or (b) require ~3 new injected callbacks (`getAthlete`, `getCurrentUserId`, `awardForSession`, `getCurrentRecordValues`) — significantly bloating the constructor signature with parameters that exist solely for the wallet/records concerns.
**Decision (per CONTEXT.md D-09 Phase A "gradual cutover, not rip-and-replace"):** Keep wallet/records/calories orchestration in `state/activity.ts` as `postStopEnrich()`. `SessionManager.stop()` writes `caloriesKcal: null` to the row; `postStopEnrich` reads `manager.snapshot()` and issues a follow-up `finalizeSession` UPDATE with the computed value. This preserves correctness (the row ends up with the same data as before the refactor) and defers the pure-domain orchestrator extraction to Phase B (D-09).
**Impact on plan target:** `state/activity.ts` LOC dropped 466 → 378, not the "rough target <250". Plan note acknowledges this is "rough" — Phase B can lift the 130-LOC `postStopEnrich` into a dedicated orchestrator if further reduction is needed.

### Surprise 3 — Concurrent parallel-wave execution
Multiple parallel-wave executors were committing to `feat/cursona-redesign` simultaneously during this plan's execution (Plans 02 / 06 / 08 / 10 visible in `git log`). Effects observed:
- **First Task 1 commit (`dfa0753`) lost its staged adds** to a race with another agent's commit and captured only `M`-modifications belonging to that agent. Re-staged and re-committed as `a7da532`. Both commits are in history; the followup commit has the actual files. Reviewer should verify `a7da532` as the canonical Task 1 commit.
- **Test count baseline jump (32→38 suites)** is not caused by this plan — parallel agents' tests started passing once the `expo-sqlite` shim landed (their tests transitively import `state/activity.ts` → `storage/sessionRepository.ts` → `expo-sqlite`).
- **`RegionPickerScreen.tsx` typecheck error** that briefly appeared in `tsc --noEmit` output during Task 2 was a parallel-agent file; it was fixed by their followup commit (`MeStackParamList` entry added). My plan was unaffected.

### Surprise 4 — `noteRaw` action retained as no-op
**Issue:** The original `useActivityStore.noteRaw(accuracy)` action both incremented `rawCount` and set `lastRawAccuracy`. After the refactor, `SessionManager.ingestRawPoint` performs both increments internally before the pipeline runs. The store's `noteRaw` action is therefore redundant. UI does not call `noteRaw` directly (`LocationAdapter` calls `ingestRawPoint`), but the action is part of the `ActivityStore` type contract.
**Decision:** Kept `noteRaw` as a no-op in the store (preserves contract) with a comment explaining redundancy. A future cleanup pass (Phase B or Plan 04+) can remove it from the `ActivityStore` type once the audit confirms no external caller depends on it.

## Cross-links

- Closes **PHASE1-07** (SessionManager extraction).
- Partially closes **CONCERNS.md R5** (real-SQLite integration tests — first repo, `sessionRepository`, done; `walletRepository` + `lapRepository` deferred to follow-up plans).
- Partially closes **CONCERNS.md R9** (god-store split — `state/activity.ts` reduced 466 → 378; remaining ~130 LOC of `postStopEnrich` deferred to Phase B per D-09).
- Preserves **R7 race-fix invariant** (functional `set((s) => ...)` semantics moved into `SessionManager.markLap` synchronous read-then-mutate; Test 4 verifies two synchronous calls yield two laps).
- Downstream Plans 07 (background reliability tests) and 10 (offline UI integration) **read `probe_outcome: red`** from this SUMMARY to know they must use the better-sqlite3 shim path.

## Self-Check: PASSED

- `apps/mobile-rn/__mocks__/expo-sqlite.ts` — FOUND ✓
- `apps/mobile-rn/src/__tests__/expoSqlite.probe.test.ts` — FOUND ✓
- `apps/mobile-rn/src/__tests__/SessionManager.test.ts` — FOUND ✓
- `apps/mobile-rn/src/__tests__/sessionRepository.integration.test.ts` — FOUND ✓
- `apps/mobile-rn/src/domain/session/SessionManager.ts` — FOUND ✓
- `apps/mobile-rn/src/domain/session/__tests__/SessionManager.smoke.test.ts` — FOUND ✓
- Commit `a7da532` (Task 1, fixed) — FOUND ✓
- Commit `16527f0` (Task 2) — FOUND ✓
- Commit `a9b5857` (Task 3) — FOUND ✓
- Commit `aaae232` (Task 4) — FOUND ✓
- Test suite green (41 / 489) — VERIFIED ✓
- `tsc --noEmit` clean — VERIFIED ✓
- `npm run lint` 0 errors — VERIFIED ✓
- No forbidden imports in `SessionManager.ts` — VERIFIED ✓
