# Deferred Items — Phase 1

Items discovered during plan execution that are out-of-scope for the current plan
but should be addressed by a later plan in this phase.

## Discovered during 01-06 (offline region picker)

### `src/__tests__/expoSqlite.probe.test.ts` fails to load — needs `expo-asset` mock

- **Discovered:** 2026-05-14, Task 1 verification (`npm test` full suite)
- **Symptom:** `Cannot find module 'expo-asset' from 'node_modules/expo-sqlite/build/hooks.js'`
- **Scope:** Pre-existing — belongs to Plan PHASE1-07 (SessionManager real-SQLite integration tests, see RESEARCH.md §Pitfall 8). This probe test was authored as a Wave-0 spike to validate `expo-sqlite@16.0.10` under jest-expo BEFORE writing the integration tests.
- **Action:** Plan PHASE1-07 owner should either:
  1. Add `jest.mock('expo-asset', () => ({}))` to the probe and document the result, OR
  2. Switch to `better-sqlite3@12.10.0` shim under `src/__mocks__/expo-sqlite.ts` per RESEARCH.md Pitfall 8 fallback.
- **NOT FIXED HERE** — unrelated to bounds-order bug and RegionPickerScreen UI; touching it would expand scope beyond PHASE1-10.

## Discovered during 01-08 (token rotation + ESLint guard)

### 55 ESLint warnings surfaced by flat-config migration

- **Discovered:** 2026-05-14, Task 2 verification (`npm run lint`)
- **Symptom:** Pre-existing warnings revealed only now because legacy `.eslintrc.json`
  could not run under ESLint v9 (lint script was broken on the branch). After migration
  to `eslint.config.js` (flat), lint successfully runs and surfaces 55 warnings.
- **Categories:**
  - `@typescript-eslint/array-type` — prefer `T[]` over `Array<T>` / `ReadonlyArray<T>` (~10 occurrences).
  - `import/first` — re-order imports to top of module (~10 occurrences in `pipeline/index.ts`, `sensors/index.ts`, `TrackerStartScreen.tsx`).
  - `import/no-duplicates` — collapse duplicate imports (`RecordsScreen.tsx`).
  - `@typescript-eslint/no-unused-vars` — `formatDistance` in `TrainingModal.tsx`, `Workout` in `WorkoutPlayer.tsx`.
  - `@typescript-eslint/no-namespace`, `no-empty-object-type` — `navigation/types.ts`.
  - `import/no-named-as-default` — `corridor.ts` using `buffer` as default import.
- **Scope:** Pre-existing across multiple files unrelated to PHASE1-13. Out of scope per
  scope-boundary rules (only auto-fix issues caused by current task).
- **Action:** A later plan (e.g. PHASE1-14 cleanup, or a dedicated lint-debt plan) should
  either auto-fix via `npm run lint -- --fix` (45 of 55 are auto-fixable) or address each
  warning explicitly.
- **NOT FIXED HERE** — warnings only; `npm run lint` exits 0. Touching them would mix
  unrelated cleanup into the security-focused PHASE1-13 commit.

### `src/__tests__/offline.test.ts` and `offlineBoundsRegression.test.ts` import `@rnmapbox/maps` directly

- **Discovered:** 2026-05-14, Task 2 (lint migration to flat-config)
- **Symptom:** With ESLint v9 flat-config working for the first time, the
  `no-restricted-imports` rule fires on these two test files (they import
  `@rnmapbox/maps` from `src/__tests__/`, outside the `src/map/` quarantine).
- **Resolution applied in PHASE1-13:** Extended the `no-restricted-imports: off`
  override to also cover `src/__tests__/**/*.{ts,tsx}` — legitimate mocking surface
  for SDK-dependent code; analogous to the existing `src/map/**` override.
- **Action:** Audit whether this exemption should be narrower (e.g. only test files
  that explicitly mock Mapbox) — but for now, `__tests__/` is small and the override
  is conservative.


## Discovered during 01-07 (adaptive sampling + SLC)

### `src/ui/Toast.tsx` typecheck error — missing JSX namespace

- **Discovered:** 2026-05-14, Task 3 verification (`npm run typecheck`)
- **Symptom:** `src/ui/Toast.tsx(18,71): error TS2503: Cannot find namespace 'JSX'.`
- **Scope:** Pre-existing on Plan 03 (closure-feedback). The Toast.tsx file is being authored by the parallel Plan 03 agent running in the same wave. Plan 03 will pin React JSX types or use `React.JSX.Element` directly to fix this.
- **NOT FIXED HERE** — this file is not in Plan 01-07's `files_modified` list; touching it would expand scope per SCOPE BOUNDARY rule.
- **Action:** Plan 03 owner addresses in their own task commits.
