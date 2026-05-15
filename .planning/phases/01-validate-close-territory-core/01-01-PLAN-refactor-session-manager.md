---
phase: 01-validate-close-territory-core
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile-rn/src/state/activity.ts
  - apps/mobile-rn/src/storage/database.ts
  - apps/mobile-rn/src/__tests__/sessionRepository.integration.test.ts
  - apps/mobile-rn/src/__tests__/SessionManager.test.ts
  - apps/mobile-rn/src/__tests__/expoSqlite.probe.test.ts
  - apps/mobile-rn/src/domain/session/SessionManager.ts
  - apps/mobile-rn/src/domain/session/__tests__/SessionManager.smoke.test.ts
  # Conditional artifacts (created only if Task 1 probe spike runs RED — see Task 1 fallback path).
  - apps/mobile-rn/src/__mocks__/expo-sqlite.ts  # conditional — only if probe spike fails
  - apps/mobile-rn/package.json                   # conditional — only if probe spike fails; adds better-sqlite3@12.10.0 devDep
autonomous: true
requirements: [PHASE1-07]
maps_to_existing_plan: P1-C-01 (SessionManager), CONCERNS.md R5 (real-SQLite integration tests), R9 (god-store split)

must_haves:
  truths:
    - "SessionManager class exists in src/domain/session/ as a pure imperative class (no zustand, no expo-sqlite, no @rnmapbox/maps imports)"
    - "useActivityStore wraps a SessionManager instance and delegates start/stop/markLap/recoverLast/ingestRawPoint/acceptPoint to it"
    - "All 435+ existing Jest tests still pass after the refactor"
    - "Real-SQLite integration tests for sessionRepository run under jest-expo using expo-sqlite ':memory:' OR via better-sqlite3 shim fallback"
    - "Crash-recovery test proves findActiveSession() returns the last unfinalized session"
  artifacts:
    - path: apps/mobile-rn/src/domain/session/SessionManager.ts
      provides: "Pure SessionManager class with start/stop/markLap/recoverLast/ingestRawPoint/acceptPoint methods + SessionRepo interface"
      min_lines: 200
    - path: apps/mobile-rn/src/__tests__/SessionManager.test.ts
      provides: "Unit tests for SessionManager state transitions with mocked repo"
      min_lines: 80
    - path: apps/mobile-rn/src/__tests__/sessionRepository.integration.test.ts
      provides: "Real-SQLite integration tests for sessionRepository"
      min_lines: 40
    - path: apps/mobile-rn/src/__tests__/expoSqlite.probe.test.ts
      provides: "5-min spike confirming expo-sqlite openDatabaseSync(':memory:') works under jest-expo"
      min_lines: 10
  key_links:
    - from: apps/mobile-rn/src/state/activity.ts
      to: apps/mobile-rn/src/domain/session/SessionManager.ts
      via: module-level singleton + onChange callback
      pattern: "new SessionManager\\("
    - from: apps/mobile-rn/src/__tests__/sessionRepository.integration.test.ts
      to: apps/mobile-rn/src/storage/database.ts
      via: _setDatabase + runMigrations test hooks
      pattern: "_setDatabase|runMigrations"
---

<objective>
Extract a pure `SessionManager` class from the 466-line `state/activity.ts` god-store, gradual-cutover (Phase A of D-09), and close CONCERNS.md R5 by adding real-SQLite integration tests for `sessionRepository`. The first task is a 5-minute spike probing whether `expo-sqlite@16.0.10` `openDatabaseSync(':memory:')` works under `jest-expo@~54.0.0` — if it fails, fall back to `better-sqlite3@12.10.0` shim per RESEARCH.md §Pitfall 8.

Purpose: Reduce the god-store (R9), enable testing of lifecycle in isolation, and guarantee that storage migrations + ON CONFLICT semantics + CHECK constraints are exercised against a real SQLite engine (not in-memory mocks). Both are launch blockers for trustworthy Phase 1 closure.
Output: A pure `SessionManager` class in `src/domain/session/`, a slimmed `useActivityStore` that delegates to it, real-SQLite integration tests under `__tests__/sessionRepository.integration.test.ts`, and a probe test confirming or refuting the jest+expo-sqlite assumption.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-validate-close-territory-core/01-CONTEXT.md
@.planning/phases/01-validate-close-territory-core/01-RESEARCH.md
@.planning/phases/01-validate-close-territory-core/01-PATTERNS.md
@.planning/codebase/CONCERNS.md
@CLAUDE.md

@apps/mobile-rn/src/state/activity.ts
@apps/mobile-rn/src/storage/database.ts
@apps/mobile-rn/src/storage/sessionRepository.ts
@apps/mobile-rn/src/domain/ClosureDetector.ts
@apps/mobile-rn/src/__tests__/pipeline.test.ts
@apps/mobile-rn/src/__tests__/walletStore.test.ts

<interfaces>
<!-- SessionManager contract (NEW — to be created in Task 2). Downstream wrappers use this. -->

```typescript
// apps/mobile-rn/src/domain/session/SessionManager.ts (NEW)
export interface SessionRepo {
  createSession(s: { id: number; startedAt: number; activityType: ActivityType }): void;
  finalizeSession(sid: number, finals: { endedAt: number; isClosed: boolean | null; distanceM: number; areaM2: number | null; calcMethod: string | null; avgHrBpm: number | null; maxHrBpm: number | null; caloriesKcal: number | null }): void;
  deleteSession(sid: number): void;
  findActiveSession(): Session | null;
  appendPoints(sid: number, pts: Point[]): void;
  loadPointsForSession(sid: number): Point[];
  appendLapsForSession(sid: number, laps: Lap[]): void;
  aggregateHrForSession(sid: number): { avgHrBpm: number | null; maxHrBpm: number | null };
}

export type ActivityState = 'idle' | 'recording' | 'stopped';

export interface SessionSnapshot {
  state: ActivityState;
  sessionId: number | null;
  points: Point[];
  laps: Lap[];
  startedAt: number | null;
  endedAt: number | null;
  distanceM: number;
  areaM2: number | null;
  isPaused: boolean;
  closureFired: boolean;
  bufferedCount: number;
  activityType: ActivityType;
}

export class SessionManager {
  constructor(
    pipeline: Pipeline,
    pauseDetector: PauseDetector,
    closureDetector: ClosureDetector,
    repo: SessionRepo,
    onChange: () => void,
  );

  start(activityType?: ActivityType): void;
  stop(): void;
  reset(): void;
  markLap(): void;
  acceptPoint(p: Point): void;
  ingestRawPoint(raw: RawPoint): void;
  recoverLast(): void;
  snapshot(): SessionSnapshot;
}
```

<!-- database.ts test hooks (NEW — exposed for integration tests in Task 3). -->

```typescript
// apps/mobile-rn/src/storage/database.ts (EXTEND)
export function _setDatabase(db: SQLite.SQLiteDatabase): void; // test-only hook
export function runMigrations(): void;                          // already exists, ensure exported
```

<!-- Existing sessionRepository functions (unchanged signatures — tests call these directly). -->

```typescript
// apps/mobile-rn/src/storage/sessionRepository.ts (existing — do not modify signatures)
export function createSession(s: { id: number; startedAt: number; activityType: ActivityType }): void;
export function finalizeSession(sid: number, finals: {...}): void;
export function findActiveSession(): Session | null;
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: 5-min spike — probe expo-sqlite under jest-expo</name>
  <files>apps/mobile-rn/src/__tests__/expoSqlite.probe.test.ts, apps/mobile-rn/src/__mocks__/expo-sqlite.ts (conditional), apps/mobile-rn/package.json (conditional)</files>
  <action>
    Create a minimal probe test (per RESEARCH.md §Pitfall 8, A1 in Assumptions Log) that verifies `expo-sqlite@16.0.10` `openDatabaseSync(':memory:')` works under `jest-expo@~54.0.0`. The test body MUST be exactly:
    `import * as SQLite from 'expo-sqlite';`
    `describe('expo-sqlite probe', () => { it('openDatabaseSync(":memory:") + execSync works under jest-expo', () => { const db = SQLite.openDatabaseSync(':memory:'); db.execSync('SELECT 1'); }); });`
    Run `cd apps/mobile-rn && npm test -- --testPathPattern=expoSqlite.probe.test.ts`. RECORD THE OUTCOME:
    - **If green:** proceed to Task 3 using `expo-sqlite` directly. Skip the better-sqlite3 fallback branch. The conditional `__mocks__/expo-sqlite.ts` and `package.json` devDep changes listed in `files_modified` are NOT created.
    - **If red:** install `better-sqlite3@12.10.0` as a devDependency (`cd apps/mobile-rn && npm install --save-dev --save-exact better-sqlite3@12.10.0` — this modifies `apps/mobile-rn/package.json`), create a Jest shim at `apps/mobile-rn/src/__mocks__/expo-sqlite.ts` that re-exports a thin `openDatabaseSync` wrapper around `better-sqlite3` exposing `execSync`, `getFirstSync`, `getAllSync`, `runSync`, `withTransactionSync`. Then re-run the probe — must go green.
    Document the outcome in a one-line `console.log('[probe] expo-sqlite under jest-expo: <green|red — fell back to better-sqlite3>')` inside the test so it appears in the run output. No commit yet — probe lives in the integration-test commit if green, or in its own infrastructure commit if fallback path was needed.

    PROBE OUTCOME RECORDING: At the end of Task 1, record the outcome verbatim as `probe_outcome: green` OR `probe_outcome: red` so it can be transcribed into the Summary template (downstream plans 07 and 10 read this).

    Implements A1 of RESEARCH.md Assumptions Log; CONCERNS.md R5; per D-10. NEVER pin `better-sqlite3` to a `^` range — must be `--save-exact 12.10.0` so Node-N-API ABI is reproducible. The conditional `__mocks__/expo-sqlite.ts` and `package.json` changes are explicitly declared in this plan's `files_modified` frontmatter so executors/Plan 10 know they may appear.
  </action>
  <verify>
    <automated>cd apps/mobile-rn && npm test -- --testPathPattern=expoSqlite.probe.test.ts</automated>
  </verify>
  <done>Probe test passes (either directly via expo-sqlite OR via the better-sqlite3 shim). Outcome line logged. No regression in existing 435 tests (run `cd apps/mobile-rn && npm test` end-to-end as a smoke check). Probe outcome (green|red) recorded for the Summary template.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extract SessionManager class with unit tests</name>
  <files>apps/mobile-rn/src/domain/session/SessionManager.ts, apps/mobile-rn/src/domain/session/__tests__/SessionManager.smoke.test.ts, apps/mobile-rn/src/__tests__/SessionManager.test.ts</files>
  <behavior>
    - Test 1: `start('run')` transitions `state` from `'idle'` to `'recording'`, calls `repo.createSession({ id, startedAt: id, activityType: 'run' })`, fires `onChange` exactly once.
    - Test 2: Calling `start()` while already `'recording'` is a no-op (no second `createSession` call).
    - Test 3: `ingestRawPoint(raw)` runs the raw through the injected `pipeline.process`, observes via `pauseDetector.observe`, and calls `acceptPoint(filtered)` only if the pipeline returns non-null.
    - Test 4: `markLap()` uses functional set semantics on internal `laps` array (preserve R7 race-fix invariant per PATTERNS.md §State Management) — calling `markLap` twice in quick succession from synchronous calls yields two lap rows, neither lost.
    - Test 5: `stop()` finalizes the session (calls `repo.finalizeSession` with computed `distanceM`/`areaM2`/`avgHrBpm`/`maxHrBpm`/`caloriesKcal`), transitions state to `'stopped'`, fires `onChange`.
    - Test 6: `recoverLast()` loads the active session via injected `repo.findActiveSession + repo.loadPointsForSession`, sets state to `'stopped'` (NOT `'recording'` — per CONCERNS.md "Crash recovery" — there is no resume path yet; explicit P1 deferred to a later phase).
    - Test 7: Snapshot returned by `snapshot()` is a fresh object (not a mutable reference) — mutating returned `points` MUST NOT corrupt internal state.
    - Test 8: All errors from `repo.createSession`/`finalizeSession`/etc. are caught and logged via `console.error('[session] <op> failed', e)` — manager methods never throw out of event-callback paths (per PATTERNS.md §Error handling, per existing pattern at activity.ts:194-198).

    Edge cases:
    - `acceptPoint` while `state === 'idle'` is a no-op.
    - `markLap` with `points.length - lapStartIdx < 2` is rejected (defensive guard per CONCERNS.md "Lap state machine").
    - `recoverLast` returns silently when `findActiveSession()` returns null.
  </behavior>
  <action>
    Create `apps/mobile-rn/src/domain/session/SessionManager.ts` per PATTERNS.md §SessionManager.ts (D-08, D-09 Phase A). Mandatory module header in Russian matching `ClosureDetector.ts:1-3` style: `// SessionManager: pure imperative lifecycle owner (start/pause/resume/ingestRawPoint/markLap/stop/save/discard/recover). // Phase 1 / PHASE1-07. См. ТЗ §4.3 (pipeline ownership), §4.5 (crash recovery). // Domain-pure: НЕ зависит от Mapbox / SQLite / zustand / React. Repos и pipeline инжектятся через constructor.`

    Class structure follows PATTERNS.md lines 47-117. The class:
    - Holds internal mutable state: `state: ActivityState`, `sessionId: number | null`, `points: Point[]`, `laps: Lap[]`, `startedAt`/`endedAt`, `distanceM`, `areaM2`, `isPaused`, `closureFired`, `buffer: Point[]`, `lapStartIdx: number`, `activityType: ActivityType`.
    - Mirrors logic of `activity.ts:187-456` but without zustand/Mapbox/SQLite imports. Use the injected `SessionRepo` interface (see `<interfaces>` block) for ALL storage operations.
    - Mirrors `start`/`stop`/`acceptPoint`/`ingestRawPoint`/`markLap`/`recoverLast`/`reset` logic line-for-line from activity.ts (see PATTERNS.md "State + lifecycle pattern" for exact source line ranges).
    - Each public mutating method calls `this.emit()` (which calls `this.onChange()`) AFTER mutation completes.
    - `snapshot()` returns a NEW object with freshly-spread arrays: `{ state, sessionId, points: [...this.points], laps: [...this.laps], ... }` — prevents external mutation from leaking back.
    - Error-handling: wrap each repo call in try/catch logging via `console.error('[session] <op> failed', e)` per PATTERNS.md §Error handling. Never re-throw.
    - Forbidden imports: `@rnmapbox/maps`, `expo-sqlite`, `expo-location`, `expo-haptics`, `zustand`, `react`, `../storage/*`, `../state/*` (per PATTERNS.md §Pure-domain layering). Allowed: `../types`, `../../util/geo`, `../../pipeline/*`, `../calories`, `../records`, `../lap`, `../AreaCalculator`, `../ClosureDetector`.

    Create the main unit test file `apps/mobile-rn/src/__tests__/SessionManager.test.ts` (path is `__tests__/` so it runs as part of the standard jest suite — per CONVENTIONS.md test-colocate exception for `__tests__/` folder). Follow PATTERNS.md "Mock-repo pattern" lines 546-557 — `makeMockRepo()` returns a jest-mocked SessionRepo plus a `__calls: string[]` log. Use `makePoint()` helper from `pipeline.test.ts:1-20` for fixture data.

    ALSO create a co-located **smoke** test at `apps/mobile-rn/src/domain/session/__tests__/SessionManager.smoke.test.ts` (renamed from `SessionManager.test.ts` to avoid Jest filename collision with `apps/mobile-rn/src/__tests__/SessionManager.test.ts` — Jest can resolve duplicate basenames inconsistently across test runs and CI matrices). Contents: just one smoke test (`it('exports a SessionManager class', () => { expect(SessionManager).toBeDefined(); })`) — this satisfies the project convention that domain modules have a co-located test file even when the main test suite lives in `src/__tests__/`. The `.smoke.test.ts` suffix also makes the file's role explicit (smoke-only, not the full behavioral suite).

    Per D-09 Phase A: do NOT modify `activity.ts` in this task — that is Task 4. SessionManager exists in isolation; tests prove it works standalone.

    Implements PHASE1-07 (D-08 Phase A), CONCERNS.md R9 (god-store split begins). NEVER define the class inside `state/activity.ts` — it MUST live in `src/domain/session/` so it can be tested without `jest-expo`. ABSOLUTELY DO NOT use words like "simplified" or "v1" — this is the full SessionManager API per D-08.
  </action>
  <verify>
    <automated>cd apps/mobile-rn && npm test -- --testPathPattern="SessionManager(\\.smoke)?\\.test"</automated>
  </verify>
  <done>SessionManager.ts exists with all listed methods. `apps/mobile-rn/src/__tests__/SessionManager.test.ts` has 8+ tests covering listed behaviors, all green. `apps/mobile-rn/src/domain/session/__tests__/SessionManager.smoke.test.ts` exists with the single smoke test, green. `npm run typecheck` clean. No imports from forbidden layers (verify via `grep -E "(rnmapbox|expo-sqlite|expo-location|expo-haptics|zustand|^import.*from.*\\.\\./(state|storage)/)" apps/mobile-rn/src/domain/session/SessionManager.ts` returns empty).</done>
</task>

<task type="auto">
  <name>Task 3: Real-SQLite integration tests for sessionRepository</name>
  <files>apps/mobile-rn/src/storage/database.ts, apps/mobile-rn/src/__tests__/sessionRepository.integration.test.ts</files>
  <action>
    Per RESEARCH.md §Code Examples "Real-SQLite integration test setup" (lines 603-635), D-10, and CONCERNS.md R5:

    Step 3a — Refactor `apps/mobile-rn/src/storage/database.ts` to expose two named exports for test injection:
    - `export function _setDatabase(db: SQLite.SQLiteDatabase): void` — overwrites the module-level singleton (currently inferred from PATTERNS.md). Guard with `if (!__DEV__) throw new Error('_setDatabase is test-only')` is acceptable but optional; minimum is the test hook exists.
    - `export function runMigrations(): void` — should already exist; verify it is exported by name and not just internal. If not exported, add the export.

    Preserve all existing migration logic. Do NOT change migration version numbers. Do NOT touch SQL schema.

    Step 3b — Create `apps/mobile-rn/src/__tests__/sessionRepository.integration.test.ts`. Source pattern: RESEARCH.md lines 605-632. Required test cases:
    1. **Crash-recovery (D-10):** `createSession({ id, startedAt: id, activityType: 'run' })` followed by NO `finalizeSession` → `findActiveSession()` returns a Session with `endedAt === null`. Then `finalizeSession(id, { endedAt: id + 60_000, isClosed: true, distanceM: 5000, areaM2: 1000, calcMethod: 'shoelace_simple', avgHrBpm: 140, maxHrBpm: 165, caloriesKcal: 300 })` → `findActiveSession()` returns null.
    2. **Migration run:** confirms `runMigrations()` on a fresh `:memory:` DB does not throw and creates the `sessions`, `points`, `laps`, `sensor_readings` tables (verify via `db.getAllSync("SELECT name FROM sqlite_master WHERE type='table'")` returns expected table names).
    3. **Activity-type roundtrip:** `createSession({ id, startedAt: id, activityType: 'trail' })` → `findActiveSession()?.activityType === 'trail'` (R10 schema sanity).

    `beforeEach`: `const db = SQLite.openDatabaseSync(':memory:'); _setDatabase(db); runMigrations();` — per RESEARCH.md.

    If Task 1's probe ran red and we are using the better-sqlite3 shim from `__mocks__/expo-sqlite.ts`, the test file is unchanged — it still imports from `'expo-sqlite'` and Jest applies the shim automatically.

    Implements D-10 + closes R5 for sessionRepository specifically. Companion repos (`walletRepository`, `lapRepository`) are deliberately scoped OUT of this plan — R5 is large and progressive; this plan delivers the FIRST real-SQLite test, proving the harness works. Wire-up of additional repos is a follow-up that downstream Phase 1 plans (or a Phase 2 cleanup) handle. NEVER pass live test data through the existing app singleton DB — use `:memory:` per beforeEach so tests are independent.
  </action>
  <verify>
    <automated>cd apps/mobile-rn && npm test -- --testPathPattern=sessionRepository.integration</automated>
  </verify>
  <done>Integration test file exists with 3+ test cases, all green. `_setDatabase` + `runMigrations` exported from database.ts. Existing 435 tests still pass (`cd apps/mobile-rn && npm test`).</done>
</task>

<task type="auto">
  <name>Task 4: Wire SessionManager into useActivityStore (delegation)</name>
  <files>apps/mobile-rn/src/state/activity.ts</files>
  <action>
    Per PATTERNS.md §"Store factory pattern (post-refactor)" lines 139-170 and D-09 Phase A: refactor `apps/mobile-rn/src/state/activity.ts` to delegate to a SessionManager instance.

    Construction pattern (insert at module scope, replacing the imperative lifecycle blocks currently at lines 103-130 of the existing file):
    - Keep existing module-level singletons: `pipeline = createDefaultPipeline(...)`, `pauseDetector = new PauseDetector(...)`, `closureDetector = new ClosureDetector(...)`. These constructors MUST remain unchanged so that closure callback behaviour from `activity.ts:119-130` is preserved (per D-18 — `closureFired` event is consumed by useClosureFeedback hook in Plan 03, do not break it).
    - Build a concrete `SessionRepo` object that adapts the existing repository module functions to the SessionRepo interface: `const repo: SessionRepo = { createSession, finalizeSession, deleteSession, findActiveSession, appendPoints, loadPointsForSession, appendLapsForSession, aggregateHrForSession };` (import from `../storage/sessionRepository`, `../storage/pointRepository`, `../storage/lapRepository`, `../storage/sensorRepository` as appropriate).
    - Instantiate ONE module-level manager: `const manager = new SessionManager(pipeline, pauseDetector, closureDetector, repo, () => useActivityStore.setState(manager.snapshot()));`
    - The exported `ingestRawPoint(raw)` function (already public API at activity.ts module level) becomes `export function ingestRawPoint(raw: RawPoint): void { manager.ingestRawPoint(raw); }`.

    Store factory becomes (PATTERNS.md lines 160-169):
    ```
    export const useActivityStore = create<ActivityStore>(() => ({
      ...manager.snapshot(),
      start: (t) => manager.start(t),
      stop: () => manager.stop(),
      reset: () => manager.reset(),
      markLap: () => manager.markLap(),
      acceptPoint: (p) => manager.acceptPoint(p),
      recoverLast: () => manager.recoverLast(),
      // ... preserve any other actions that already existed (clearError, etc.) as-is.
    }));
    ```

    CRITICAL preservation (do NOT delete or alter):
    - The closure-detector callback that fires `closureFired` event (currently activity.ts:119-130) — this is consumed by Plan 03's `useClosureFeedback` hook via the store selector. If the callback is moved into SessionManager (D-09 Phase B), preserve the snapshot field `closureFired: boolean` so downstream selectors `useActivityStore(s => s.closureFired)` keep working. Phase A (this plan) keeps the callback OUTSIDE the manager and fires `useActivityStore.setState({ closureFired: true, areaM2 })` directly — the next plan (or Phase B follow-up) can migrate it.
    - Functional `set((s) => ...)` race-safety pattern from R7 fix (activity.ts:443-456) — the `markLap` action MUST still use functional set IF a wrapper layer (post-manager) reads existing state. If `markLap` is now a pure delegation `() => manager.markLap()` (no read-then-write at the store layer), the race-safety lives inside SessionManager (covered by Task 2 Test 4).

    After the refactor, the file should be substantially shorter (target: <200 LOC, down from 466). All `useActivityStore(s => s.points)`, `(s => s.startedAt)`, `(s => s.isPaused)`, `(s => s.closureFired)`, `(s => s.distanceM)`, `(s => s.areaM2)`, etc. selectors throughout the UI (TrackerLiveScreen, RunDetailsScreen, TrackerStartScreen, MetricsBar) MUST continue to read identical values — DO NOT rename any snapshot field.

    Implements D-09 Phase A (gradual cutover). Phase B (moving closure detection + lap orchestration into manager) is deliberately deferred — keep this plan small. ABSOLUTELY DO NOT introduce a parallel "old code path" — the store either delegates fully or the refactor is incomplete. NEVER rename snapshot fields (those are public contract for UI).
  </action>
  <verify>
    <automated>cd apps/mobile-rn && npm test && npm run typecheck && npm run lint</automated>
  </verify>
  <done>Full test suite passes (435+ tests). `useActivityStore` is structurally a SessionManager delegator. `state/activity.ts` LOC drops noticeably (rough target: <250 lines). No UI file changes required. `console.error('[session] ...')` logs visible if `repo.createSession` etc. fail.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| jest-test runtime → expo-sqlite native bridge | Probe test loads native module under jest-expo; failure mode = fallback to better-sqlite3 shim. No trust violation — both run in-process within developer machine. |
| useActivityStore (renderer) → SessionManager (domain) | No trust boundary (same JS bundle, same user, same process). |
| SessionManager → SessionRepo (storage) | Internal seam — SessionRepo is an injected interface. Manager does not validate repo behavior; repo is part of the same trust zone. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-01-01 | Tampering | better-sqlite3 native binary | accept | If fallback path triggered, better-sqlite3 is a devDependency (not shipped to user). Pin to exact version (12.10.0, --save-exact) for ABI reproducibility. |
| T-01-01-02 | Repudiation | Crash-recovery test outcome | accept | Phase 1 is single-user; no audit log requirement. The test proves the data path, not user accountability. |
| T-01-01-03 | Information Disclosure | console.error('[session]...') | accept | Logs go to Metro/device log only. No PII in the error payloads (just operation names + error message from SQLite). |
| T-01-01-04 | Denial of Service | SessionManager mutating reference snapshots | mitigate | snapshot() returns fresh arrays `[...this.points]` so external mutation cannot corrupt internal state — covered by Task 2 Test 7. |

This plan has very low security surface — it is an internal refactor of domain logic. No new network calls, no new external dependencies that touch the bundle (better-sqlite3 is devDep-only if used).
</threat_model>

<verification>
- `cd apps/mobile-rn && npm test` — full Jest suite passes (435 existing + new SessionManager unit tests + sessionRepository.integration.test.ts + expoSqlite.probe.test.ts)
- `cd apps/mobile-rn && npm run typecheck` clean
- `cd apps/mobile-rn && npm run lint` clean (especially `no-restricted-imports` continues to pass; SessionManager.ts does not import @rnmapbox/maps, expo-sqlite, expo-location, expo-haptics, zustand, or react)
- Manual smoke: load app on Pixel emulator, start a fake session via dev menu (or run the existing app start flow), verify metrics tile still updates per-second (proves manager.snapshot()-via-onChange wiring works end-to-end).
- `grep -E "(rnmapbox|expo-sqlite|expo-location|expo-haptics|zustand)" apps/mobile-rn/src/domain/session/SessionManager.ts` returns no matches.
</verification>

<success_criteria>
- All must_haves.truths above are observably TRUE.
- File `apps/mobile-rn/src/domain/session/SessionManager.ts` exists, exports a class, is pure-domain.
- `useActivityStore` delegates lifecycle methods to the manager instance.
- `sessionRepository.integration.test.ts` runs under `npm test` with green status — either via direct expo-sqlite or via the better-sqlite3 shim.
- Probe test is green; outcome (direct vs. fallback) is logged.
- No regression in pre-existing tests (435 baseline, per STATUS.md).
- Atomic commits per task following `feat(phase1): <description> (PHASE1-07)` format.
</success_criteria>

<output>
After completion, create `.planning/phases/01-validate-close-territory-core/01-01-SUMMARY.md` capturing:
- `[probe_outcome: green|red]` — Task 1 probe result (downstream plans 07 and 10 read this verbatim; emit one of the two values literally, do NOT paraphrase)
- Probe test outcome description (direct expo-sqlite OR better-sqlite3 fallback) — narrative form
- SessionManager LOC; activity.ts before/after LOC; god-store reduction percentage
- New tests added + total Jest count after the change
- Whether conditional `__mocks__/expo-sqlite.ts` + `package.json` devDep change were created (only if probe_outcome was red)
- Any surprises (e.g. snapshot field rename was forced for any reason)
- Cross-link: closes PHASE1-07; partially closes CONCERNS.md R5 + R9
</output>
</output>
