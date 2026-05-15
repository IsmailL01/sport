---
phase: 01-validate-close-territory-core
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile-rn/src/navigation/screens/record/hooks/useTrackerCamera.ts
  - apps/mobile-rn/src/navigation/screens/record/hooks/useLayerVisibility.ts
  - apps/mobile-rn/src/navigation/screens/record/hooks/usePauseUI.ts
  - apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx
  - apps/mobile-rn/src/__tests__/useTrackerCamera.test.tsx
  - apps/mobile-rn/src/__tests__/useLayerVisibility.test.tsx
  - apps/mobile-rn/src/__tests__/usePauseUI.test.tsx
autonomous: true
requirements: [PHASE1-06]
maps_to_existing_plan: P1-B (MapScreen refactor — TrackerLiveScreen already extracted per D-05; this plan extracts reusable HOOKS from the screen body)

must_haves:
  truths:
    - "useTrackerCamera hook returns cameraProps + fitToBounds the screen can pass directly to MapboxView"
    - "useLayerVisibility hook returns showTrack/showCorridor/showZone/dimOverlay flags driven by isPaused + closureFired + points.length"
    - "usePauseUI hook returns auto-pause indicator state + pause/resume binding"
    - "TrackerLiveScreen.tsx body shrinks by ≥100 lines after hooks are wired"
    - "Visual behavior of TrackerLiveScreen is identical before and after refactor (no regression in render output)"
  artifacts:
    - path: apps/mobile-rn/src/navigation/screens/record/hooks/useTrackerCamera.ts
      provides: "Camera follow + heading + bounds-fit hook for TrackerLiveScreen"
      min_lines: 30
    - path: apps/mobile-rn/src/navigation/screens/record/hooks/useLayerVisibility.ts
      provides: "Layer toggle flags hook (track/corridor/zone/dim)"
      min_lines: 25
    - path: apps/mobile-rn/src/navigation/screens/record/hooks/usePauseUI.ts
      provides: "Auto-pause indicator + manual pause binding hook"
      min_lines: 25
  key_links:
    - from: apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx
      to: apps/mobile-rn/src/navigation/screens/record/hooks/useTrackerCamera.ts
      via: import + call at top of component body
      pattern: "useTrackerCamera\\(\\)"
    - from: apps/mobile-rn/src/navigation/screens/record/hooks/useTrackerCamera.ts
      to: apps/mobile-rn/src/state/activity.ts
      via: useActivityStore selectors (per-field, not whole store)
      pattern: "useActivityStore\\(\\(s\\) => s\\."
---

<objective>
Extract three reusable React hooks from `TrackerLiveScreen.tsx` per CONTEXT.md D-05/D-06/D-07: `useTrackerCamera()`, `useLayerVisibility()`, `usePauseUI()`. The screen ALREADY exists (per D-05 — STATUS.md confirms `TrackerLiveScreen.tsx` is in the codebase); this is a HOOK extraction, not a screen extraction. Co-locate hook unit tests using `@testing-library/react-native@13.3.3` `renderHook` (installed but unused — first user in the codebase).

Purpose: Reduce TrackerLiveScreen body so the next plan (Plan 03 — closure haptic + toast feedback) and future feature work (privacy zones, segments) can compose behavior cleanly. Co-locate test patterns establish the `renderHook` convention for the entire codebase.
Output: Three hook files in `apps/mobile-rn/src/navigation/screens/record/hooks/`, three colocated tests in `apps/mobile-rn/src/__tests__/`, and a slimmed `TrackerLiveScreen.tsx` that calls the hooks instead of holding inline selector blocks + effect logic.
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
@CLAUDE.md

@apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx
@apps/mobile-rn/src/state/activity.ts

<interfaces>
<!-- Hook contracts (NEW). Screen body imports these and uses them in place of inline logic. -->

```typescript
// apps/mobile-rn/src/navigation/screens/record/hooks/useTrackerCamera.ts
export function useTrackerCamera(): {
  cameraProps: {
    followUserLocation: boolean;
    followZoomLevel: number;
    followUserMode?: 'normal' | 'course' | 'compass';
    animationMode?: 'flyTo' | 'easeTo' | 'linearTo' | 'moveTo';
    animationDuration?: number;
  };
  fitToBounds: (bounds: [[number, number], [number, number]], padding?: number) => void;
};

// apps/mobile-rn/src/navigation/screens/record/hooks/useLayerVisibility.ts
export function useLayerVisibility(): {
  showTrack: boolean;
  showCorridor: boolean;
  showZone: boolean;
  dimOverlay: boolean;
};

// apps/mobile-rn/src/navigation/screens/record/hooks/usePauseUI.ts
export function usePauseUI(): {
  isPaused: boolean;
  isAutoPaused: boolean;
  pauseLabel: string;
  toggle: () => void;
};
```

<!-- Existing useActivityStore selectors the hooks consume (do not change shape). -->

```typescript
// apps/mobile-rn/src/state/activity.ts (existing — post Plan 01 refactor)
useActivityStore((s) => s.points): Point[]
useActivityStore((s) => s.startedAt): number | null
useActivityStore((s) => s.isPaused): boolean
useActivityStore((s) => s.closureFired): boolean
useActivityStore((s) => s.state): 'idle' | 'recording' | 'stopped'
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create useTrackerCamera, useLayerVisibility, usePauseUI hooks with tests</name>
  <files>apps/mobile-rn/src/navigation/screens/record/hooks/useTrackerCamera.ts, apps/mobile-rn/src/navigation/screens/record/hooks/useLayerVisibility.ts, apps/mobile-rn/src/navigation/screens/record/hooks/usePauseUI.ts, apps/mobile-rn/src/__tests__/useTrackerCamera.test.tsx, apps/mobile-rn/src/__tests__/useLayerVisibility.test.tsx, apps/mobile-rn/src/__tests__/usePauseUI.test.tsx</files>
  <behavior>
    **useTrackerCamera:**
    - Test 1: Returns `cameraProps.followUserLocation === true` when `state === 'recording'` AND `points.length > 0` AND NOT closureFired.
    - Test 2: Returns `cameraProps.followUserLocation === false` after `closureFired === true` (camera releases for bounds-fit on stop).
    - Test 3: `fitToBounds(bounds, padding)` is a stable function reference across re-renders with the same bounds (memoize via useCallback).

    **useLayerVisibility:**
    - Test 1: `showTrack === true` when `points.length >= 2`.
    - Test 2: `showZone === true` when `closureFired === true`.
    - Test 3: `dimOverlay === true` when `isPaused === true` (per existing CONCERNS.md "map dim on pause" Round 2 behavior).
    - Test 4: `showCorridor === true` always during `state === 'recording'` (corridor is the live recording corridor — already shipped).

    **usePauseUI:**
    - Test 1: `isPaused` mirrors `useActivityStore(s => s.isPaused)`.
    - Test 2: `pauseLabel` returns Russian "Пауза" when not paused, "Продолжить" when paused (verify exact strings against TrackerLiveScreen existing labels — read the file to confirm before authoring assertions).
    - Test 3: `toggle()` calls into the store — mock the store action and verify it was invoked.
  </behavior>
  <action>
    Per PATTERNS.md §useTrackerCamera.ts (lines 184-219) and PATTERNS.md §useClosureFeedback.ts patterns:

    Step 1a — Read `apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx` and identify the following inline blocks to extract:
    - Camera-related useState/useRef/useEffect around the MapboxView (`followUserLocation`, `followZoomLevel`, bounds-fit logic on stop).
    - Layer-visibility derived flags (`showTrack`, `showCorridor`, `showZone`, `dimOverlay`).
    - Pause-UI label + auto-pause indicator + pause/resume button binding.

    Step 1b — Create the three hook files. Module-header pattern per PATTERNS.md §Module-header comments:
    ```
    // useTrackerCamera: Mapbox camera follow + heading + bounds-fit hook for TrackerLiveScreen.
    // Phase 1 / PHASE1-06. См. ТЗ §10 (карта), DEVELOPMENT_PLAN.md §3 P1-B.
    // Pure presentation — reads useActivityStore selectors, returns shape mapping 1:1 to MapboxView props.
    ```

    Import pattern (per PATTERNS.md §Imports lines 807-822):
    ```
    import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

    import { useActivityStore } from '../../../../state/activity';
    ```

    Hook bodies (per PATTERNS.md "Selector subscription pattern" lines 193-199, **CRITICAL** — select primitives one-at-a-time, never the whole store):
    ```
    const points = useActivityStore((s) => s.points);
    const isPaused = useActivityStore((s) => s.isPaused);
    const closureFired = useActivityStore((s) => s.closureFired);
    const state = useActivityStore((s) => s.state);
    ```

    For `useTrackerCamera`: returned `fitToBounds` MUST be memoized with `useCallback([points.length])` so a stable reference is provided to MapboxView (re-renders on bounds-fit only when significant point count changes). The bounds-fit `useEffect` watches `closureFired`: when it transitions false→true, compute the bounding box of `points` (use existing `util/geo` helper if available; otherwise inline a min/max over `[lng, lat]` arrays) and call `mapboxRef.fitBounds(...)` via a passed-in or context-provided ref. If the screen currently passes a `mapboxRef` into the inline logic, expose `fitToBounds` as a function the screen calls AFTER the hook supplies the bounds — keep the ref ownership in the screen, the hook only computes the bounds.

    For `useLayerVisibility`: pure-derived flags. Use `useMemo([points.length, isPaused, closureFired, state])` to keep flag identity stable across re-renders.

    For `usePauseUI`: read `isPaused`, expose `toggle: () => useActivityStore.getState().setPaused?.(!isPaused)` — VERIFY the existing store action name by reading activity.ts before assuming `setPaused` (it may be `pause`/`resume` or a single `togglePause` function). Use whatever name the existing UI button currently calls. Russian strings: copy verbatim from TrackerLiveScreen's existing pause button label so behavior is identical.

    Step 1c — Co-locate tests in `apps/mobile-rn/src/__tests__/` (per CONVENTIONS.md test-colocate exception + PATTERNS.md §useClosureFeedback.test.tsx lines 619-650 pattern). Test imports:
    ```
    import { renderHook, act } from '@testing-library/react-native';
    import { useTrackerCamera } from '../navigation/screens/record/hooks/useTrackerCamera';
    ```

    Mock the store inside each test using `jest.mock('../state/activity', () => ({ useActivityStore: <fake-selector-impl> }))`. Pattern for the fake (Zustand without React-tree dependency per RESEARCH.md Open Question #2):
    ```
    const mockState = { points: [], isPaused: false, closureFired: false, state: 'recording' };
    jest.mock('../state/activity', () => ({
      useActivityStore: (selector: (s: typeof mockState) => unknown) => selector(mockState),
    }));
    ```
    Mutate `mockState` between `renderHook` invocations to drive each test scenario; call `rerender()` to re-evaluate the hook.

    Per D-07: hooks live in `apps/mobile-rn/src/navigation/screens/record/hooks/` with co-located unit tests. NEVER use `useActivityStore()` without a selector — that would subscribe to the entire store and defeat the per-field optimization that PATTERNS.md flags as "Critical". DO NOT import `@rnmapbox/maps` from any hook file — hooks are screen-layer, not map-layer, and the ESLint `no-restricted-imports` rule will reject the import.

    Implements PHASE1-06 (D-05, D-06, D-07).
  </action>
  <verify>
    <automated>cd apps/mobile-rn && npm test -- --testPathPattern="(useTrackerCamera|useLayerVisibility|usePauseUI).test"</automated>
  </verify>
  <done>All three hook files exist, all three test files have ≥3 tests each, all green. `cd apps/mobile-rn && npm run typecheck` clean. `cd apps/mobile-rn && npm run lint` clean.</done>
</task>

<task type="auto">
  <name>Task 2: Wire hooks into TrackerLiveScreen + verify no behavior regression</name>
  <files>apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx</files>
  <action>
    Per PATTERNS.md §TrackerLiveScreen.tsx (MODIFY) lines 310-326:

    Step 2a — Read the current `TrackerLiveScreen.tsx` end-to-end. Identify the blocks corresponding to:
    - Camera state/effects (selectors `points`, `startedAt`; followUserLocation/followZoomLevel useState; bounds-fit useEffect on closureFired)
    - Layer visibility derivations
    - Pause-UI label/indicator/binding

    Step 2b — Replace those inline blocks with hook calls at the top of the component body:
    ```
    const cameraProps = useTrackerCamera();
    const layerFlags = useLayerVisibility();
    const pauseUi = usePauseUI();
    ```
    Pass `cameraProps` to MapboxView via spread or per-prop; pass `layerFlags.showTrack`/`showCorridor`/`showZone`/`dimOverlay` to the corresponding `<TrackLayer>`/`<CorridorLayer>`/`<ZoneLayer>`/dim overlay; bind the pause button onPress to `pauseUi.toggle` with label `pauseUi.pauseLabel`.

    Step 2c — PRESERVE all of these blocks UNTOUCHED (they are scoped to other plans or are critical glue):
    - The Stop+Confirm Save flow (Alert + `nav.replace('RunDetails', ...)` per CONTEXT.md D-20 — owned by Plan 04).
    - The `closureFired` event consumer (will receive new `useClosureFeedback` hook in Plan 03 — DO NOT add it here).
    - The `SubMetric` local component (PATTERNS.md line 327 — screen-local presentation, not extractable).
    - The 1Hz `setInterval(() => setNow(Date.now()), 1000)` effect (per PATTERNS.md lines 201-207 — UI tick, owned by the screen).
    - All imports already present (MapboxView, layers, layout primitives).

    Step 2d — Run an A/B snapshot. Before editing, `cd apps/mobile-rn && npm test 2>&1 | tail -3` to record baseline test count. After editing, re-run and confirm the count is identical (no skipped tests, no new failures). Then run the app on Pixel emulator: start a fake session (existing dev menu or the standard record flow), watch the metric tile update, hit Pause/Resume, verify visual identical-ness with the pre-refactor build (a 30-second smoke test by the executor).

    The TrackerLiveScreen body should shrink by ≥100 lines after this task. ABSOLUTELY DO NOT alter Russian strings, button labels, or visual layout — the hooks must return exactly the values the inline code was computing. NEVER introduce new dependencies or import @rnmapbox/maps anywhere new in this file (it's already imported in this file's existing block — leave the existing imports alone).

    Implements PHASE1-06 wire-up. Implements D-05 (TrackerLiveScreen IS the extracted screen — this task slims it down further via hooks).
  </action>
  <verify>
    <automated>cd apps/mobile-rn && npm test && npm run typecheck && npm run lint</automated>
  </verify>
  <done>TrackerLiveScreen.tsx file LOC drops by ≥100 (compare before/after `wc -l`). All 435+ tests still pass. Manual smoke on Pixel emulator confirms identical visual behavior of camera follow, layer toggles, pause indicator. Atomic commit message: `refactor(phase1): extract hooks from TrackerLiveScreen (PHASE1-06)`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

No new trust boundaries introduced — this is a pure presentation refactor (UI-layer code stays in UI-layer, no new network calls, no new data sources, no new dependencies).

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-02-01 | Tampering | Hook returns mutating reference | accept | Hooks return `useMemo`-stabilized objects; consumers (the screen) treat the return as read-only. React enforces immutability convention. |
| T-01-02-02 | Information Disclosure | Hook log output | accept | Hooks emit no log lines. The screen continues to log via existing patterns. |

This plan has no meaningful threat surface — refactor only.
</threat_model>

<verification>
- `cd apps/mobile-rn && npm test` — full suite passes; new hook tests added (≥9 new tests across 3 files).
- `cd apps/mobile-rn && npm run typecheck` clean.
- `cd apps/mobile-rn && npm run lint` clean (no `@rnmapbox/maps` import outside `src/map/`).
- Visual smoke on Pixel emulator: identical camera follow + layer toggles + pause/resume behavior.
- `wc -l apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx` shows ≥100 lines fewer than pre-refactor.
- `grep -c "useActivityStore" apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx` shows ≤2 (Stop+Save selector for area/distance display can remain; everything else moved into hooks).
</verification>

<success_criteria>
- All three hooks exist as standalone files; each has a co-located test with ≥3 tests.
- TrackerLiveScreen.tsx body shrinks meaningfully (≥100 lines).
- No visual or behavioral regression detected during manual smoke test.
- New hook tests use `@testing-library/react-native@13.3.3 renderHook` — establishes the convention for the rest of the codebase per RESEARCH.md Open Question #2.
- Atomic commits per task: Task 1 commit `feat(phase1): extract TrackerLive hooks (PHASE1-06)`, Task 2 commit `refactor(phase1): wire TrackerLive hooks into screen (PHASE1-06)`.
</success_criteria>

<output>
After completion, create `.planning/phases/01-validate-close-territory-core/01-02-SUMMARY.md` capturing:
- Hook line counts; TrackerLiveScreen before/after LOC delta
- Total new tests; updated Jest baseline count
- Any deviation from D-06's suggested hook names (and justification)
- Cross-link: closes PHASE1-06 fully
</output>
