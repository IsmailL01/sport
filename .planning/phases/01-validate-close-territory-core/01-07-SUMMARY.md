---
phase: 01-validate-close-territory-core
plan: 07
subsystem: location/adapter + domain/session + state
tags: [adaptive-sampling, slc-fallback, gap-resume, location-adapter]
requires: [PHASE1-11, PHASE1-12]
provides:
  - "LocationAdapter.setSamplingMode(mode) — adaptive sampling profile switch"
  - "SamplingMode union type ('active' | 'paused' | 'background-slc')"
  - "ExpoLocationAdapter idempotent expo-location reconfigure (replace-in-place)"
  - "SessionManager → LocationAdapter wiring on PauseDetector transitions"
  - "SessionManager.handleAppForeground() — iOS gap-resume pipeline reset"
  - "settings.gpsGapTriggerS (MMKV-persisted, clamped 0 < s ≤ 600, default 30)"
  - "AppState listener at module init in state/activity.ts"
affects:
  - "src/state/activity.ts (constructor wiring + AppState listener)"
  - "src/state/settings.ts (gpsGapTriggerS field + v5→v6 migration)"
  - "src/domain/session/SessionManager.ts (constructor accepts adapter + getter)"
  - "src/location/LocationAdapter.ts (interface extended)"
  - "src/location/adapters/ExpoLocationAdapter.ts (setSamplingMode + MODE_OPTIONS table)"
tech-stack:
  added: []
  patterns:
    - "Idempotent expo-location reconfigure via startLocationUpdatesAsync(TASK_NAME, opts)"
    - "Table-driven MODE_OPTIONS<SamplingMode, Location.LocationTaskOptions>"
    - "Constructor-injected lazy getter for runtime-mutable settings values"
    - "AppState listener at store-module init (no React lifecycle dependency)"
    - "MMKV schema migration step (v5 → v6) for new persisted field"
key-files:
  created:
    - apps/mobile-rn/src/__tests__/ExpoLocationAdapter.test.ts
    - apps/mobile-rn/src/__tests__/gapResume.test.ts
  modified:
    - apps/mobile-rn/src/location/LocationAdapter.ts
    - apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts
    - apps/mobile-rn/src/state/settings.ts
    - apps/mobile-rn/src/state/activity.ts
    - apps/mobile-rn/src/domain/session/SessionManager.ts
    - apps/mobile-rn/src/__tests__/SessionManager.test.ts
    - .planning/phases/01-validate-close-territory-core/deferred-items.md
decisions:
  - "MODE_OPTIONS.active uses distanceInterval=0 (verbatim from prior start() impl) — keeps 1Hz emission even on weak GPS where jitter <5m would otherwise hide movement. RESEARCH.md baseline says distanceInterval:5 in Pattern 5 — we keep the existing more aggressive setting (no regression)."
  - "LocationAdapter injected via constructor (preferred per pure-domain layering); SessionManager imports only the interface (no concrete ExpoLocationAdapter import inside domain)."
  - "Constructor-extension bundled: locationAdapter + gapTriggerSecGetter added in Task 2 (per plan-checker round 2 fix). Task 3 only wires AppState listener + creates test file."
  - "Settings schema bumped v5→v6 with explicit migration for gpsGapTriggerS (defaults to 30 on upgrade); MMKV persisted via existing storage helpers."
  - "Strict `>` comparison in handleAppForeground — exactly-threshold gap does NOT trigger reset. Safer than `>=` (boundary cases on integer second values won't re-fire on every foreground)."
metrics:
  duration: 13m
  completed: 2026-05-15
---

# Phase 1 Plan 07: Adaptive Sampling + iOS SLC Fallback — Summary

**One-liner:** Extended `LocationAdapter` with `setSamplingMode('active'|'paused'|'background-slc')` (idempotent expo-location reconfigure), wired `SessionManager.setPaused` → adapter mode switch + `pipeline.reset()`, and added iOS gap-resume via `AppState` listener calling `handleAppForeground()` that resets the pipeline when GPS silence exceeds `settings.gpsGapTriggerS` (default 30s).

## Tasks Completed (3 / 3)

| Task | Name | Commit |
|------|------|--------|
| 1 | LocationAdapter.setSamplingMode + ExpoLocationAdapter impl + tests (11 cases) | `4d3d335` |
| 2 | SessionManager constructor extended (adapter + gapTriggerSecGetter); setPaused wired; settings.gpsGapTriggerS added; 5 new SessionManager test cases | `c1dc7fa` |
| 3 | AppState listener registered + 7 gapResume.test.ts cases | `39ba6a7` |

## MODE_OPTIONS values shipped

```typescript
const MODE_OPTIONS: Record<SamplingMode, Location.LocationTaskOptions> = {
  active: {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: 0,         // 1Hz regardless of jitter (existing behavior)
    timeInterval: 1000,
    showsBackgroundLocationIndicator: true,
    foregroundService: FOREGROUND_SERVICE,  // same notification copy as before
    activityType: Location.ActivityType.Fitness,
  },
  paused: {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 50,        // ≥50m smoothes parking jitter
    timeInterval: 5000,
    showsBackgroundLocationIndicator: true,
    foregroundService: FOREGROUND_SERVICE,
    activityType: Location.ActivityType.Fitness,
  },
  'background-slc': {
    accuracy: Location.Accuracy.Lowest,
    distanceInterval: 500,        // ~SLC approximation
    timeInterval: 0,
  },
};
```

**Deviation from RESEARCH.md §Pattern 5 baseline:** `active.distanceInterval=0` (vs. `5` shown in baseline). Justification — the existing pre-refactor `start()` uses `distanceInterval:0` with a comment ("точки приходят по timeInterval раз в секунду независимо от смещения … критично на слабом GPS"). Changing to 5 would regress weak-GPS behavior. RESEARCH.md baseline `5` was a placeholder; this plan preserves the proven existing value.

**SLC limitation documented** in ExpoLocationAdapter module header: `expo-location@19.0.8` does not expose `startMonitoringSignificantLocationChanges`; `'background-slc'` mode uses the closest available analogue (`Accuracy.Lowest` + `distanceInterval: 500`). True SLC requires a custom native module — out of scope per D-30.

## LocationAdapter wiring approach

**Constructor injection (preferred).** `SessionManager`'s constructor takes the adapter as the 5th positional parameter. SessionManager imports only the `LocationAdapter` interface (no platform deps). The wrapper (`state/activity.ts`) passes the singleton `locationAdapter` (already exported from `src/location/index.ts` — pre-existing, no new export needed).

## Test counts

| Stage | Suites | Tests |
|-------|-------:|------:|
| Baseline (pre-task-1) | 41 | 489 |
| After Task 1 (ExpoLocationAdapter tests +11) | 42 | 500 |
| After Task 2 (SessionManager tests +5) | 42 | 505 |
| After Task 3 (gapResume tests +7) + Plan 03 parallel commits | **44** | **515** |

**Net new tests in this plan: +23 tests / +2 suites.** Suite count delta (41 → 44 = +3) includes 1 suite added by parallel Plan 03 (Toast.test.tsx). Test count 489 → 515 = +26 total; subtracting Plan 03's ~3 tests → my contribution is ~23 (11 adapter + 5 SessionManager additions + 7 gapResume).

## Verification

- `cd apps/mobile-rn && npm test` → **44 suites / 515 tests passing** ✓
- `cd apps/mobile-rn && npm run typecheck` → **clean on my files** (Plan 03's `Toast.tsx` produces an unrelated `JSX` namespace error — logged in `deferred-items.md`) ✓
- `cd apps/mobile-rn && npm run lint` → **0 errors**, 58 warnings (all pre-existing) ✓
- `grep -nE "setSamplingMode|handleAppForeground" SessionManager.ts` → 4 matches (method definitions + comments) ✓
- Forbidden-import check on SessionManager.ts: only the `LocationAdapter` *type* is imported (`import type { LocationAdapter }`), no concrete `ExpoLocationAdapter` import, no `expo-location` / `react-native` direct imports in domain — pure-domain layering preserved ✓

## Manual smoke result

**Not performed in this plan execution.** Per `<verification>` block: manual smoke ("background app 60s on Pixel emulator, foreground, observe `[gap-resume] ...` log") is for runtime QA on a built APK. Plan execution is offline (no Pixel emulator running). The unit tests in `gapResume.test.ts` exercise the full `handleAppForeground` path (gap detection, threshold comparison, pipeline.reset, warn log format) — sufficient for code-level acceptance. Field smoke will be captured during Plan 09 (T-row field protocol).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] jest.mock factory referenced out-of-scope variables**
- **Found during:** Task 1 (first `npm test` run)
- **Issue:** `jest.mock('expo-location', () => ({ startLocationUpdatesAsync: (...args) => startLocationUpdates(...args), ... }))` — `startLocationUpdates` is hoisted out-of-scope. Babel error: `The module factory of jest.mock() is not allowed to reference any out-of-scope variables.`
- **Fix:** Renamed all hoisted-mock references to `mockStartLocationUpdates` / `mockStopLocationUpdates` / `mockHasStarted`. Variable names prefixed with `mock` are allowlisted by Jest.
- **Files modified:** `apps/mobile-rn/src/__tests__/ExpoLocationAdapter.test.ts`
- **Commit:** Folded into `4d3d335`

**2. [Rule 3 — Blocking] TypeScript narrow inference on jest.fn return types**
- **Found during:** Task 1 typecheck after fix #1
- **Issue:** `jest.fn(() => Promise.resolve())` infers a 0-arg call signature; spreading `...args` failed with TS2556. Tuple-cast on `mock.calls[0]` failed because the inferred type is `[]`.
- **Fix:** Explicitly type the mocks as `jest.Mock` and accept `(..._args: unknown[])` in the inner thunk. Tuple casts then succeed.
- **Files modified:** `apps/mobile-rn/src/__tests__/ExpoLocationAdapter.test.ts`
- **Commit:** Folded into `4d3d335`

**3. [Rule 2 — Critical] Pre-existing `noteRaw` test contract retained**
- **Found during:** Task 2 (extending SessionManager test helpers)
- **Issue:** Plan 01's wrapper retained `noteRaw` as a no-op action for backward-compat (per 01-01-SUMMARY.md Surprise 4). My SessionManager constructor extension did NOT alter this contract — existing tests pass unchanged.
- **Fix:** N/A — this is documentation of an invariant preservation, not a fix.

### Out-of-scope discoveries (logged in `deferred-items.md`, not fixed)

- `src/ui/Toast.tsx(18,71): TS2503: Cannot find namespace 'JSX'` — this file belongs to parallel Plan 03 (closure feedback). Per SCOPE BOUNDARY rule, not fixed here; Plan 03 owner will address.

## Cross-links

- Closes **PHASE1-11** (adaptive sampling — D-27, D-28: LocationAdapter extended, SessionManager triggers mode switch on PauseDetector transitions).
- Closes **PHASE1-12** (SLC fallback / iOS gap-resume — D-29, D-30, D-31: AppState listener resets pipeline on > 30s GPS silence; SLC mode approximated via `Accuracy.Lowest` + `distanceInterval: 500`).
- Maps to **DEVELOPMENT_PLAN.md P1-I-02** (iOS SLC safety-net) and **P1-I-05** (adaptive sampling).
- Field validation deferred to **Plan 09** (T6 battery / T8 background time field tests — implementation lands here, runtime numbers land in T-rows).
- Preserves **R7 race-fix invariant** — no zustand `set()` calls bypassed (all mutations still flow through SessionManager → onChange → store.setState).
- Preserves **CLAUDE.md LocationAdapter abstraction rule** — pure-domain SessionManager imports only the `LocationAdapter` *interface* (type-only import); no concrete `ExpoLocationAdapter` or `expo-location` references inside domain.

## Self-Check: PASSED

- `apps/mobile-rn/src/location/LocationAdapter.ts` (SamplingMode + setSamplingMode signature) — FOUND ✓
- `apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts` (MODE_OPTIONS + setSamplingMode impl) — FOUND ✓
- `apps/mobile-rn/src/__tests__/ExpoLocationAdapter.test.ts` (NEW, 11 tests) — FOUND ✓
- `apps/mobile-rn/src/__tests__/gapResume.test.ts` (NEW, 7 tests) — FOUND ✓
- `apps/mobile-rn/src/domain/session/SessionManager.ts` (extended constructor + handleAppForeground) — FOUND ✓
- `apps/mobile-rn/src/state/settings.ts` (gpsGapTriggerS + v6 migration) — FOUND ✓
- `apps/mobile-rn/src/state/activity.ts` (AppState listener + adapter/getter injection) — FOUND ✓
- Commit `4d3d335` (Task 1) — FOUND ✓
- Commit `c1dc7fa` (Task 2) — FOUND ✓
- Commit `39ba6a7` (Task 3) — FOUND ✓
- Test suite green (44 / 515) — VERIFIED ✓
- `tsc --noEmit` clean for plan-owned files — VERIFIED ✓ (Toast.tsx error is Plan 03's, logged as deferred)
- `npm run lint` 0 errors — VERIFIED ✓
- No forbidden imports in `SessionManager.ts` (only `import type { LocationAdapter }`) — VERIFIED ✓
