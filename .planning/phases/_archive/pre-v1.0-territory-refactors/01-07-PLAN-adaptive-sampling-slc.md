---
phase: 01-validate-close-territory-core
plan: 07
type: execute
wave: 2
depends_on: [01]
files_modified:
  - apps/mobile-rn/src/location/LocationAdapter.ts
  - apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts
  - apps/mobile-rn/src/state/settings.ts
  - apps/mobile-rn/src/domain/session/SessionManager.ts
  - apps/mobile-rn/src/__tests__/ExpoLocationAdapter.test.ts
  - apps/mobile-rn/src/__tests__/gapResume.test.ts
autonomous: true
requirements: [PHASE1-11, PHASE1-12]
maps_to_existing_plan: P1-I-02 (iOS Significant Location Changes safety-net), P1-I-05 (Adaptive sampling rate)

must_haves:
  truths:
    - "LocationAdapter interface has a new setSamplingMode(mode: SamplingMode): Promise<void> method"
    - "SamplingMode type union: 'active' | 'paused' | 'background-slc'"
    - "ExpoLocationAdapter.setSamplingMode() reconfigures expo-location via Location.startLocationUpdatesAsync(TASK_NAME, MODE_OPTIONS[mode]) — idempotent re-config"
    - "SessionManager calls adapter.setSamplingMode('paused') when PauseDetector fires paused; calls 'active' on resume"
    - "settingsStore.gpsGapTriggerS = 30 (default) is persisted via MMKV; AppState listener detects gaps > thresholdMs on foreground and calls pipeline.reset() — never interpolates (D-29)"
    - "Tests cover: each mode passes the correct expo-location options table; setSamplingMode is a no-op when not running; gap detector resets pipeline only when gap > threshold"
  artifacts:
    - path: apps/mobile-rn/src/__tests__/ExpoLocationAdapter.test.ts
      provides: "Adapter tests asserting mode→config mapping + idempotent behavior"
      min_lines: 60
    - path: apps/mobile-rn/src/__tests__/gapResume.test.ts
      provides: "AppState listener test asserting pipeline.reset() fires after gap > thresholdMs"
      min_lines: 50
  key_links:
    - from: apps/mobile-rn/src/domain/session/SessionManager.ts
      to: apps/mobile-rn/src/location/LocationAdapter.ts
      via: adapter.setSamplingMode('paused'|'active') invoked when pauseDetector transitions
      pattern: "setSamplingMode"
    - from: apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts
      to: "expo-location Location.startLocationUpdatesAsync"
      via: idempotent re-config call
      pattern: "startLocationUpdatesAsync"
---

<objective>
Per CONTEXT.md D-27..D-31 + RESEARCH.md §Pattern 5 + §Pattern 6 + §Pitfall 5: (1) extend the `LocationAdapter` interface with `setSamplingMode(mode: 'active' | 'paused' | 'background-slc')`; (2) implement it in `ExpoLocationAdapter` via a table-driven `MODE_OPTIONS` map of `Location.LocationTaskOptions`; (3) hook the call into `SessionManager` so `PauseDetector` transitions trigger the appropriate sampling mode; (4) add iOS gap-resume AppState listener that detects > `gpsGapTriggerS` second silence on app foreground and calls `pipeline.reset()` (NEVER interpolate the gap, per D-29).

Purpose: NFR-003 battery target (≤10%/h) requires aggressive downsampling when the user is paused, but NFR-005 (≥95% record-time background) requires high-fidelity sampling when moving. The two cannot coexist in a single static config — adaptive sampling is the answer. The SLC mode covers iOS edge case where backgrounded foreground service is killed; D-30 confirms Android is not in scope.
Output: Extended interface, idempotent expo-location adapter mode-switch, SessionManager subscription to PauseDetector for mode changes, AppState gap-resume hook, two new test files covering both behaviors.
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
@.planning/phases/01-validate-close-territory-core/01-01-SUMMARY.md
@CLAUDE.md

@apps/mobile-rn/src/location/LocationAdapter.ts
@apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts
@apps/mobile-rn/src/state/settings.ts
@apps/mobile-rn/src/pipeline/filters/PauseDetector.ts
@apps/mobile-rn/src/__tests__/realtimeAdapter.test.ts

<interfaces>
<!-- LocationAdapter extension (EXTEND). -->

```typescript
// apps/mobile-rn/src/location/LocationAdapter.ts (EXTEND)
export type SamplingMode = 'active' | 'paused' | 'background-slc';

export interface LocationAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): Promise<boolean>;
  requestForegroundPermission(): Promise<boolean>;
  requestBackgroundPermission(): Promise<boolean>;
  /** Переключить sampling profile без stop/start. По умолчанию — 'active'. */
  setSamplingMode(mode: SamplingMode): Promise<void>;
}
```

<!-- Settings extension (EXTEND). -->

```typescript
// apps/mobile-rn/src/state/settings.ts (EXTEND)
// Add: gpsGapTriggerS: number (default 30, MMKV-persisted key 'gpsGapTriggerS').
```

<!-- SessionManager wiring (uses adapter via constructor injection — Plan 01 already created this seam). -->

```typescript
// apps/mobile-rn/src/domain/session/SessionManager.ts (EXTEND — depend_on Plan 01)
// constructor accepts a `locationAdapter: LocationAdapter` (or this is wired in the store layer; planner picks the cleaner seam).
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend LocationAdapter + implement setSamplingMode in ExpoLocationAdapter + tests</name>
  <files>apps/mobile-rn/src/location/LocationAdapter.ts, apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts, apps/mobile-rn/src/__tests__/ExpoLocationAdapter.test.ts</files>
  <behavior>
    - Test 1: `setSamplingMode('active')` calls `Location.startLocationUpdatesAsync(TASK_NAME, { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, ... })`. Assert via spy on the mocked `startLocationUpdatesAsync`.
    - Test 2: `setSamplingMode('paused')` calls it with `{ accuracy: Location.Accuracy.Balanced, distanceInterval: 50, timeInterval: 5000 }`.
    - Test 3: `setSamplingMode('background-slc')` calls it with `{ accuracy: Location.Accuracy.Lowest, distanceInterval: 500, timeInterval: 0 }`.
    - Test 4: When `hasStartedLocationUpdatesAsync` resolves `false`, `setSamplingMode` is a no-op (does NOT call `startLocationUpdatesAsync`).
    - Test 5: `setSamplingMode` does NOT call `stopLocationUpdatesAsync` before reconfig (per RESEARCH.md §Pattern 5 line 399 — re-call is idempotent and replaces config in-place; calling stop+start would add 1-2s gap, RESEARCH.md A5).
    - Test 6: Calling `setSamplingMode('active')` after `setSamplingMode('paused')` re-applies the active options (the second call wins — proves idempotency of replace).
  </behavior>
  <action>
    Per PATTERNS.md §LocationAdapter.ts (lines 423-442) + §ExpoLocationAdapter.ts (lines 446-475) + RESEARCH.md Pattern 5:

    Step 1a — Edit `apps/mobile-rn/src/location/LocationAdapter.ts`. Add the `SamplingMode` type export and the `setSamplingMode` method to the interface (per <interfaces> block above). The JSDoc comment stays Russian to match existing style.

    Step 1b — Edit `apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts`. Per PATTERNS.md lines 458-475:
    - At module level, define `MODE_OPTIONS: Record<SamplingMode, Location.LocationTaskOptions>`:
      ```
      const MODE_OPTIONS: Record<SamplingMode, Location.LocationTaskOptions> = {
        active: {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 0,
          timeInterval: 1000,
          showsBackgroundLocationIndicator: true,
          foregroundService: { /* copy verbatim from existing start() at lines 61-65 — preserve notification title/body */ },
          activityType: Location.ActivityType.Fitness,
        },
        paused: {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 50,
          timeInterval: 5000,
          showsBackgroundLocationIndicator: true,
          foregroundService: { /* same as active */ },
        },
        'background-slc': {
          accuracy: Location.Accuracy.Lowest,
          distanceInterval: 500,
          timeInterval: 0,
        },
      };
      ```
      READ the existing `apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts` to find the actual lines that build the current `LocationTaskOptions` in `start()`. Copy the `foregroundService` block VERBATIM (same notification title, body, channelId) for the `active` and `paused` modes — DO NOT change user-visible notification text.

    - Add the method:
      ```
      async setSamplingMode(mode: SamplingMode): Promise<void> {
        if (!(await this.isRunning())) return;
        await Location.startLocationUpdatesAsync(TASK_NAME, MODE_OPTIONS[mode]);
      }
      ```
      Per RESEARCH.md §Pattern 5 line 399: `startLocationUpdatesAsync` is idempotent on the same `TASK_NAME` — re-call replaces config without stop. Do NOT call `stop` first.

    Step 1c — Tests at `apps/mobile-rn/src/__tests__/ExpoLocationAdapter.test.ts`. Pattern: PATTERNS.md §ExpoLocationAdapter.test.ts (lines 657-676):
    ```
    const startLocationUpdates = jest.fn();
    const hasStarted = jest.fn(() => Promise.resolve(true));
    jest.mock('expo-location', () => ({
      startLocationUpdatesAsync: (...args: unknown[]) => startLocationUpdates(...args),
      hasStartedLocationUpdatesAsync: () => hasStarted(),
      stopLocationUpdatesAsync: jest.fn(),
      requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
      requestBackgroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
      Accuracy: { BestForNavigation: 6, Balanced: 3, Lowest: 1 },
      ActivityType: { Fitness: 3 },
    }));
    jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
    ```

    Then ≥6 tests per Behavior section. Use `beforeEach` to reset mocks. For Test 4: `hasStarted.mockReturnValueOnce(Promise.resolve(false))` and assert `startLocationUpdates` was NOT called.

    ABSOLUTELY DO NOT call `stop` then `start` for mode switches — that creates a 1-2s sampling gap per RESEARCH.md A5. The replace-in-place pattern is the ONLY supported path. NEVER use `Location.Accuracy.High` for `active` mode — `BestForNavigation` is required for the GPS pipeline to make accuracy decisions (existing code already uses this).

    Implements PHASE1-11 adapter layer (D-27).
  </action>
  <verify>
    <automated>cd apps/mobile-rn && npm test -- --testPathPattern=ExpoLocationAdapter.test</automated>
  </verify>
  <done>LocationAdapter interface extended; ExpoLocationAdapter implements setSamplingMode; tests have ≥6 cases all green. `npm run typecheck` clean.</done>
</task>

<task type="auto">
  <name>Task 2: Wire SessionManager to call setSamplingMode on PauseDetector transitions</name>
  <files>apps/mobile-rn/src/domain/session/SessionManager.ts</files>
  <action>
    Per D-28 + RESEARCH.md §Pattern 5 + §Pitfall 5:

    Step 2a — Read `apps/mobile-rn/src/domain/session/SessionManager.ts` (created in Plan 01). Locate the PauseDetector wiring — Plan 01 either subscribes to PauseDetector in the constructor or via a method. Determine the seam where `isPaused` transitions occur.

    Step 2b — Extend the SessionManager constructor to accept an additional dependency: `locationAdapter: LocationAdapter`. Add to constructor signature (per <interfaces>):
    ```
    constructor(
      private readonly pipeline: Pipeline,
      private readonly pauseDetector: PauseDetector,
      private readonly closureDetector: ClosureDetector,
      private readonly repo: SessionRepo,
      private readonly locationAdapter: LocationAdapter, // NEW
      private readonly onChange: () => void,
    ) {}
    ```

    Step 2c — In whichever internal method observes PauseDetector transitions (probably inside `ingestRawPoint` after `this.pauseDetector.observe(accepted)`), check `pauseDetector.isPaused` / `state` and call:
    - On false→true transition (just paused): `this.locationAdapter.setSamplingMode('paused').catch(e => console.error('[session] setSamplingMode paused failed', e)); this.pipeline.reset();`
    - On true→false transition (just resumed): `this.locationAdapter.setSamplingMode('active').catch(e => console.error('[session] setSamplingMode active failed', e)); this.pipeline.reset();`

    The `pipeline.reset()` after a mode switch is critical per RESEARCH.md §Pitfall 5 — Kalman state is stale at the new accuracy level; reset re-initializes on the first new point. NEVER omit the reset — it produces 15-30m jumps at resume.

    Step 2d — Update the store-layer wiring in `apps/mobile-rn/src/state/activity.ts` (touched by Plan 01) to inject the location adapter:
    ```
    import { expoLocationAdapter } from '../location';

    const manager = new SessionManager(
      pipeline,
      pauseDetector,
      closureDetector,
      repo,
      expoLocationAdapter, // NEW — singleton from src/location/index.ts
      () => useActivityStore.setState(manager.snapshot()),
    );
    ```
    Verify `expoLocationAdapter` (or whatever the existing singleton is called) is already exported from `src/location/index.ts`. If not, ADD the export.

    Step 2e — Update Plan 01's SessionManager unit tests to inject a mock adapter:
    ```
    function makeMockAdapter(): LocationAdapter & { __modes: SamplingMode[] } {
      const modes: SamplingMode[] = [];
      return {
        start: jest.fn(() => Promise.resolve()),
        stop: jest.fn(() => Promise.resolve()),
        isRunning: jest.fn(() => Promise.resolve(true)),
        requestForegroundPermission: jest.fn(() => Promise.resolve(true)),
        requestBackgroundPermission: jest.fn(() => Promise.resolve(true)),
        setSamplingMode: jest.fn(async (m) => { modes.push(m); }),
        __modes: modes,
      };
    }
    ```
    Add ≥2 tests in `apps/mobile-rn/src/__tests__/SessionManager.test.ts`: (a) PauseDetector transition to paused calls `setSamplingMode('paused')` exactly once; (b) transition to resumed calls `setSamplingMode('active')` AND `pipeline.reset()`.

    Per CLAUDE.md §Domain pure + PATTERNS.md §Pure-domain layering: SessionManager imports `LocationAdapter` (just the interface from `../location/LocationAdapter`). It does NOT import `ExpoLocationAdapter` directly — only the interface; the concrete is injected. The interface import is allowed because `LocationAdapter.ts` is a pure-interface file with no platform deps.

    Implements PHASE1-11 wire-up (D-28).
  </action>
  <verify>
    <automated>cd apps/mobile-rn && npm test -- --testPathPattern=SessionManager.test && npm run typecheck && npm run lint</automated>
  </verify>
  <done>SessionManager constructor accepts LocationAdapter. SessionManager.test.ts has new test cases proving mode-switch on pause transitions. Full Jest suite green. lint clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: iOS gap-resume AppState listener + settingsStore.gpsGapTriggerS + tests</name>
  <files>apps/mobile-rn/src/state/settings.ts, apps/mobile-rn/src/domain/session/SessionManager.ts, apps/mobile-rn/src/__tests__/gapResume.test.ts</files>
  <behavior>
    - Test 1: When AppState changes to 'active' and `Date.now() - lastPoint.timestamp > thresholdMs`, `pipeline.reset()` is called and `console.warn('[gap-resume] ...')` logs.
    - Test 2: When AppState changes to 'active' and gap < threshold, `pipeline.reset()` is NOT called.
    - Test 3: When AppState changes to 'active' and `points.length === 0`, nothing happens (no division-by-zero or null-deref).
    - Test 4: When AppState changes to 'background' or 'inactive', the listener does nothing (it only runs on transition to 'active').
    - Test 5: `useSettingsStore.getState().gpsGapTriggerS` is read at runtime (not captured at listener registration time) so changes in Settings take effect on the next foreground transition.
  </behavior>
  <action>
    Per CONTEXT.md D-29..D-31 + RESEARCH.md §Pattern 6 (lines 411-435):

    Step 3a — Edit `apps/mobile-rn/src/state/settings.ts`. Add a new persisted field `gpsGapTriggerS: number` with default `30` (per D-31). MMKV-persist via the existing storage helpers in the file. Expose a setter `setGpsGapTriggerS(seconds: number)` validated `0 < seconds ≤ 600` (clamp out-of-range values). Read the existing settings store structure first to match style (other fields like `theme`, `units`, `phoneE164`).

    Step 3b — Add an `AppState` listener for gap-resume. Two placement options:
    1. Inside `SessionManager` — register the listener inside the constructor; on `'active'` transition, check `this.points.length` + last timestamp vs threshold; call `this.pipeline.reset()` if gap exceeded.
    2. Inside `state/activity.ts` — register at module level, dispatching to `manager.handleGapResume()` (a new public method on SessionManager).

    Pick option 1 (SessionManager owns the gap-resume logic) so it stays unit-testable without React. Module-level listener at the store level can call into the manager.

    Inside SessionManager:
    ```
    handleAppForeground(): void {
      if (this.points.length === 0) return;
      const last = this.points[this.points.length - 1];
      const gapMs = Date.now() - last.timestamp;
      const thresholdMs = this.gapTriggerSec() * 1000;
      if (gapMs > thresholdMs) {
        this.pipeline.reset();
        console.warn(`[gap-resume] ${gapMs}ms gap detected — pipeline reset`);
      }
    }
    private gapTriggerSec(): number {
      // Inject via constructor OR read from a passed-in getter
      return this.gapTriggerSecGetter();
    }
    ```

    To preserve pure-domain layering (no React/zustand import in SessionManager), inject a getter via constructor: `private readonly gapTriggerSecGetter: () => number`. The store layer wires `() => useSettingsStore.getState().gpsGapTriggerS`.

    Update SessionManager constructor to accept the getter — extend the constructor signature you already extended in Task 2. (Two constructor extensions in this plan; commit them together with the wire-up.)

    Step 3c — In `apps/mobile-rn/src/state/activity.ts` (or in a small new module `src/state/appStateBridge.ts` if cleaner), register the AppState listener at module init:
    ```
    import { AppState, type AppStateStatus } from 'react-native';

    AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      manager.handleAppForeground();
    });
    ```

    Per D-29: "Do not interpolate — leave the gap visible on the track; the user knows GPS was lost." Pipeline reset triggers Kalman re-init on next point; no synthetic points are added.

    Step 3d — Tests at `apps/mobile-rn/src/__tests__/gapResume.test.ts`. Drive SessionManager directly:
    ```
    it('reset on gap > threshold', () => {
      const reset = jest.fn();
      const pipeline = { process: jest.fn(), reset } as unknown as Pipeline;
      const m = new SessionManager(pipeline, ..., () => 30 /* gap trigger getter */, () => {});
      // Inject a point with old timestamp
      (m as any).points = [{ timestamp: Date.now() - 60_000, /* ... */ }];
      m.handleAppForeground();
      expect(reset).toHaveBeenCalled();
    });
    ```
    No real AppState mocking needed — call `manager.handleAppForeground()` directly. (The AppState listener glue is tested indirectly via the manual smoke on a real device, and the store-layer registration is just `AppState.addEventListener(...)` — pure plumbing.)

    NEVER call `pipeline.reset()` from outside the manager — that breaks the invariant that the manager is the sole owner of pipeline lifecycle. NEVER interpolate the gap by manufacturing fake points — leaves the user honestly informed that GPS was lost.

    Implements PHASE1-12 (D-29, D-31).
  </action>
  <verify>
    <automated>cd apps/mobile-rn && npm test -- --testPathPattern=gapResume.test && npm run typecheck</automated>
  </verify>
  <done>settings.ts has gpsGapTriggerS persisted with default 30. SessionManager.handleAppForeground exists with proper gating. gapResume.test.ts has ≥5 tests, all green. AppState listener registered in module init. Manual smoke: background the app for 60s on Pixel emulator (use ADB `adb shell input keyevent 26` to lock screen), foreground; observe `[gap-resume] ... pipeline reset` in logcat.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| AppState ('active' transition) → pipeline.reset() | Trusted internal event from React Native AppState API. No external input on the listener path. |
| settingsStore.gpsGapTriggerS (user-configurable) → gap threshold | User-controlled threshold; clamped to 0 < s ≤ 600 to prevent pathological values (e.g., 0 = always reset on foreground; 1e9 = effectively disabled). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-07-01 | Tampering | User sets gpsGapTriggerS to 0 → every foreground resets pipeline → tiny gaps lose Kalman state | mitigate | Clamp setter to `0 < s ≤ 600` in setGpsGapTriggerS; UI input (future) will enforce same range. |
| T-01-07-02 | Denial of Service | setSamplingMode called rapidly → expo-location reconfigured many times → battery + bridge overhead | accept | Caller (SessionManager) only calls on PauseDetector transitions which are rate-limited by the detector's hysteresis. Documented in PauseDetector docs. |
| T-01-07-03 | Information Disclosure | Background-SLC mode uses Accuracy.Lowest (~500m precision) → less precise GPS — privacy improvement (incidental) | accept | This is a degradation for accuracy budget, not a security control. Phase 4 will own privacy zones. |
| T-01-07-04 | Spoofing | Malicious app fakes AppState 'active' events | accept | OS-level events; no way to spoof from another app. AppState is system-provided. |

Low security surface. ASVS V5 (input validation) applies to setGpsGapTriggerS clamping.
</threat_model>

<verification>
- `cd apps/mobile-rn && npm test` — full suite green; new tests for adapter + gap-resume.
- `cd apps/mobile-rn && npm run typecheck` + `npm run lint` clean.
- Manual on Pixel emulator: start a session, walk in place to trigger PauseDetector → observe `setSamplingMode('paused')` log → walk again → `setSamplingMode('active')` log → background app 60s → foreground → `[gap-resume] ...` log.
- `grep -nE "setSamplingMode|handleAppForeground" apps/mobile-rn/src/domain/session/SessionManager.ts` — confirms both methods present.
</verification>

<success_criteria>
- All must_haves.truths above are TRUE.
- Field validation of NFR-003 (battery ≤10%/h) and NFR-005 (background ≥95% record-time) will land via Plan 09 (T6/T8 rows) — this plan ships the implementation; the validation is field-test.
- Atomic commits per task: Task 1 `feat(phase1): LocationAdapter.setSamplingMode (PHASE1-11)`, Task 2 `feat(phase1): SessionManager wires PauseDetector→setSamplingMode (PHASE1-11)`, Task 3 `feat(phase1): iOS gap-resume on AppState foreground (PHASE1-12)`.
</success_criteria>

<output>
After completion, create `.planning/phases/01-validate-close-territory-core/01-07-SUMMARY.md` capturing:
- Final MODE_OPTIONS values shipped (any deviation from RESEARCH.md Pattern 5 baseline?)
- Whether `LocationAdapter` was injected via constructor (preferred) or via a method
- Manual smoke result (logs observed?)
- Cross-link: closes PHASE1-11 + PHASE1-12 + P1-I-02 + P1-I-05 (implementation only — field test verification via Plan 09)
</output>
