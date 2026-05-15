---
phase: 01-validate-close-territory-core
plan: 05
type: execute
wave: 2
depends_on: [02]
files_modified:
  - apps/mobile-rn/src/map/components/TrackLayer.tsx
  - apps/mobile-rn/src/map/components/HistoryTerritoryLayer.tsx
  - apps/mobile-rn/src/map/util/simplify.ts
  - apps/mobile-rn/src/__tests__/trackSimplify.test.ts
  # Screen-side callers updated to pass the live camera zoom prop into TrackLayer.
  # Plan 02 (Wave 1) refactors TrackerLiveScreen first (extracts hooks); this plan
  # touches the same file in Wave 2 only after Plan 02 has landed.
  - apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx
  - apps/mobile-rn/src/navigation/screens/record/RunDetailsScreen.tsx
autonomous: true
requirements: [PHASE1-05]
maps_to_existing_plan: P1-D-04 (стратегия обновления при больших треках — DEVELOPMENT_PLAN.md §3.5)

must_haves:
  truths:
    - "TrackLayer renders a dual GeoJSON source — track-simplified for visual LineLayer when points.length > 2000; track-raw is never sent to the visual layer"
    - "HistoryTerritoryLayer applies the same simplification strategy to overlay layers built from long sessions"
    - "Tolerance scales with zoom via BASE_TOLERANCE_DEG * Math.pow(2, 12 - zoom)"
    - "@turf/simplify is called with { mutate: false, highQuality: false } so raw points are never mutated"
    - "Area calculation continues to use the raw points (never the simplified output) — verified by reading callers of AreaCalculator"
    - "Unit tests assert: trigger at >2000 pts, no-op below threshold, tolerance scales with zoom, mutate=false preserves input"
  artifacts:
    - path: apps/mobile-rn/src/map/util/simplify.ts
      provides: "simplifyForDisplay({ points, zoom }) utility — pure, no React, no Mapbox imports"
      min_lines: 30
    - path: apps/mobile-rn/src/__tests__/trackSimplify.test.ts
      provides: "Unit tests for simplifyForDisplay covering threshold, tolerance scaling, mutate=false invariant"
      min_lines: 60
  key_links:
    - from: apps/mobile-rn/src/map/components/TrackLayer.tsx
      to: apps/mobile-rn/src/map/util/simplify.ts
      via: simplifyForDisplay()
      pattern: "simplifyForDisplay"
    - from: apps/mobile-rn/src/map/components/HistoryTerritoryLayer.tsx
      to: apps/mobile-rn/src/map/util/simplify.ts
      via: simplifyForDisplay()
      pattern: "simplifyForDisplay"
    - from: apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx
      to: apps/mobile-rn/src/map/components/TrackLayer.tsx
      via: zoom prop passthrough from live camera
      pattern: "zoom=\\{"
---

<objective>
Per CONTEXT.md D-12, D-13, D-14, D-15: implement Douglas-Peucker simplification on the VISUAL track layer when point count exceeds 2000. Two GeoJSON sources: `track-simplified` (consumed by `LineLayer`) and `track-raw` (never rendered, available for any internal consumer). The same simplification is applied to `HistoryTerritoryLayer` so overlay rendering of all closed sessions stays performant. Library: `@turf/simplify@^7.3.5` (already installed — no new dep).

**Wave 2 rationale:** depends on Plan 02 (hooks extraction) to land first so `TrackerLiveScreen.tsx` is slim and the zoom-prop wiring is straightforward — Task 2 adds an optional `zoom` prop to `TrackLayer` and wires it from `TrackerLiveScreen` + `RunDetailsScreen`. Plan 02 (Wave 1) heavily refactors `TrackerLiveScreen.tsx`; running this plan in parallel would cause merge conflicts on the same file. Sequencing into Wave 2 makes the file-ownership conflict explicit.

Purpose: NFR-006 (≥50 fps panning at 5000+ points) requires this; field test T7 will validate. Today TrackLayer + HistoryTerritoryLayer re-allocate the full coords array on every render (per CONCERNS.md "Map render perf"); on long tracks (>5000 points) this drops FPS materially.
Output: A `simplifyForDisplay` helper in `src/map/util/simplify.ts`, wired into TrackLayer and HistoryTerritoryLayer; the new optional `zoom` prop on TrackLayer plumbed in from TrackerLiveScreen + RunDetailsScreen callers; tests asserting threshold, tolerance scaling, mutate=false invariant.
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

@apps/mobile-rn/src/map/components/TrackLayer.tsx
@apps/mobile-rn/src/map/components/HistoryTerritoryLayer.tsx
@apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx
@apps/mobile-rn/src/navigation/screens/record/RunDetailsScreen.tsx
@apps/mobile-rn/src/__tests__/pipeline.test.ts

<!-- Plan 02 lands first in Wave 1; its SUMMARY documents the hook contracts this plan composes with. -->
@.planning/phases/01-validate-close-territory-core/01-02-SUMMARY.md

<interfaces>
<!-- New utility (NEW). -->

```typescript
// apps/mobile-rn/src/map/util/simplify.ts (NEW)
import type { Feature, LineString } from '@turf/helpers';

export const SIMPLIFY_THRESHOLD_PTS = 2000;
export const BASE_TOLERANCE_DEG = 0.00005; // ~5m at zoom 12, equator

export function dynamicTolerance(zoom: number): number;

/**
 * Returns a Feature<LineString> ready for ShapeSource consumption.
 * - If points.length < SIMPLIFY_THRESHOLD_PTS: returns the raw lineString (no simplification cost).
 * - Else: returns simplified Feature with tolerance = dynamicTolerance(zoom).
 * NEVER mutates the input array.
 */
export function simplifyForDisplay(opts: {
  points: ReadonlyArray<{ latitude: number; longitude: number }>;
  zoom?: number;
}): Feature<LineString> | null;
```

<!-- Existing turf imports. -->

```typescript
// node_modules/@turf/simplify (existing — version ^7.3.5 confirmed in RESEARCH.md)
import simplify from '@turf/simplify';
import { lineString } from '@turf/helpers';
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create simplifyForDisplay utility + tests</name>
  <files>apps/mobile-rn/src/map/util/simplify.ts, apps/mobile-rn/src/__tests__/trackSimplify.test.ts</files>
  <behavior>
    - Test 1: `simplifyForDisplay({ points: <100 points> })` returns the raw `lineString(coords)` Feature (no simplification — under threshold).
    - Test 2: `simplifyForDisplay({ points: <3000 points spaced 1m apart in a straight line>, zoom: 12 })` returns a Feature whose `geometry.coordinates.length` is < 100 (Douglas-Peucker collapses near-collinear points).
    - Test 3: `simplifyForDisplay({ points: <3000 points>, zoom: 16 })` returns MORE coordinates than at zoom 12 (tighter tolerance via `Math.pow(2, 12 - 16)` = 1/16x). Assert the output length at zoom 16 ≥ output length at zoom 12 for the same input.
    - Test 4: `dynamicTolerance(12) === BASE_TOLERANCE_DEG`. `dynamicTolerance(14) === BASE_TOLERANCE_DEG * 0.25`. `dynamicTolerance(10) === BASE_TOLERANCE_DEG * 4`.
    - Test 5: Mutate invariant — calling `simplifyForDisplay({ points, zoom: 12 })` does NOT mutate the input array. Capture `JSON.stringify(points)` before + after, assert equal.
    - Test 6: `simplifyForDisplay({ points: [] })` returns `null` (no LineString possible with 0 points). `simplifyForDisplay({ points: [{lat: 1, lng: 1}] })` also returns `null` (single point not a line).
    - Test 7: `simplifyForDisplay({ points: <2 points> })` returns a valid 2-coord lineString (the minimum valid line).
  </behavior>
  <action>
    Per RESEARCH.md §Pattern 2 (lines 270-298) + §Pitfall 3 (lines 489-495) + CONTEXT.md D-12..D-15:

    Create `apps/mobile-rn/src/map/util/simplify.ts`. Module header:
    ```
    // simplifyForDisplay: Douglas-Peucker simplification ТОЛЬКО для визуальной отрисовки трека.
    // Phase 1 / PHASE1-05. См. CONTEXT.md D-12..D-15, ТЗ §10.5, DEVELOPMENT_PLAN.md §3 P1-D-04.
    // ВАЖНО: area calc и closure detection используют RAW points — никогда не передавать
    // simplified output в AreaCalculator (это даст 5-15% ошибки площади).
    ```

    Body (per RESEARCH.md Pattern 2):
    ```
    import simplify from '@turf/simplify';
    import { lineString, type Feature, type LineString } from '@turf/helpers';

    export const SIMPLIFY_THRESHOLD_PTS = 2000;
    export const BASE_TOLERANCE_DEG = 0.00005;

    export function dynamicTolerance(zoom: number): number {
      return BASE_TOLERANCE_DEG * Math.pow(2, 12 - zoom);
    }

    export function simplifyForDisplay(opts: {
      points: ReadonlyArray<{ latitude: number; longitude: number }>;
      zoom?: number;
    }): Feature<LineString> | null {
      const { points, zoom = 14 } = opts;
      if (points.length < 2) return null;
      const coords = points.map((p) => [p.longitude, p.latitude] as [number, number]);
      const raw = lineString(coords);
      if (points.length < SIMPLIFY_THRESHOLD_PTS) return raw;
      return simplify(raw, {
        tolerance: dynamicTolerance(zoom),
        highQuality: false,
        mutate: false,
      });
    }
    ```

    NEVER pass `mutate: true` — that mutates the input array (per Pitfall 3); 5-15% area calc error follows. ALWAYS wrap in `lineString(coords)` first — passing raw coords to simplify is a Turf v6 idiom and v7 requires Feature<LineString>.

    Tests at `apps/mobile-rn/src/__tests__/trackSimplify.test.ts`. Pattern: PATTERNS.md §pipeline.test.ts (lines 22-60) — pure-function unit tests, no React. Fixture helper:
    ```
    function makeLinePoints(count: number, dlat = 0.00001, dlon = 0.00001): { latitude: number; longitude: number }[] {
      return Array.from({ length: count }, (_, i) => ({ latitude: 50.0 + i * dlat, longitude: 10.0 + i * dlon }));
    }
    ```

    Implements PHASE1-05 utility layer (D-12, D-13, D-14). NEVER ship this utility outside `src/map/` — its imports `@turf/simplify` are NOT restricted by ESLint, but the utility's name `simplify.ts` lives in `src/map/util/` to make its role clear (display-only).
  </action>
  <verify>
    <automated>cd apps/mobile-rn && npm test -- --testPathPattern=trackSimplify.test</automated>
  </verify>
  <done>simplify.ts exists with all three exports. Test file has ≥7 tests all green. `npm run typecheck` clean. `grep -c "mutate: false" apps/mobile-rn/src/map/util/simplify.ts` shows ≥1.</done>
</task>

<task type="auto">
  <name>Task 2: Wire simplifyForDisplay into TrackLayer + HistoryTerritoryLayer + plumb zoom prop from screen callers</name>
  <files>apps/mobile-rn/src/map/components/TrackLayer.tsx, apps/mobile-rn/src/map/components/HistoryTerritoryLayer.tsx, apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx, apps/mobile-rn/src/navigation/screens/record/RunDetailsScreen.tsx</files>
  <action>
    Step 2a — Read `apps/mobile-rn/src/map/components/TrackLayer.tsx`. Identify the current `useMemo` that produces the GeoJSON LineString feature (per CONCERNS.md "useMemo keyed on points array" — currently `useMemo(() => pointsToLineString([...points]), [points])`).

    Refactor:
    - Replace the existing memo with a call to `simplifyForDisplay({ points, zoom })`.
    - Memo dependency: `[points.length, zoom]` (NOT `[points]` — array identity changes every accept; per RESEARCH.md §Anti-Patterns line 439 "Putting simplify(...) inside useMemo([points]) on every point append — gets called O(N) per minute"). The length-and-zoom dependency means simplification ONLY re-runs when length crosses a boundary or zoom changes.
    - Bonus optimization (optional, document if applied): memo on `[Math.floor(points.length / 50), zoom]` — coalesce updates to every 50 new points to reduce re-renders further; verify visually that the trail still updates smoothly during recording. Skip this optimization if it makes the trail visibly choppy.
    - Add `zoom?: number` as an optional prop on `TrackLayer` (default 14).
    - The `<LineLayer>` consumes the simplified Feature via the `<ShapeSource>` shape prop. The render code stays — only the feature-producing memo changes.

    PRESERVE all existing props and behavior. The component signature should not change except for the new optional `zoom` prop.

    Step 2b — **Update screen callers to pass live camera zoom** (this is why the plan depends on Plan 02 landing first — `TrackerLiveScreen.tsx` and `RunDetailsScreen.tsx` are touched here):
    - `apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx` — after Plan 02 has landed `useTrackerCamera()` hook, the live camera zoom is available via the hook return (`cameraProps.followZoomLevel`) or via a `MapboxView` ref's `zoomLevel`. Pass it through to `<TrackLayer zoom={...} />`. If the hook does not expose the current zoom, read it from `MapboxView`'s `onCameraChanged` callback into a local `useState<number>(14)` and pass that. Prefer the hook path — avoid adding new state in the screen if the hook already provides it.
    - `apps/mobile-rn/src/navigation/screens/record/RunDetailsScreen.tsx` — RunDetails is post-Save view rendering a historical track. Use the camera's current zoom (read via `onCameraChanged` or via the camera ref's `getZoom()` at the time the layer renders) and pass it as `<TrackLayer zoom={currentZoom} />`. If the screen does not currently track zoom, add `const [zoom, setZoom] = useState(14)` and wire `onCameraChanged={({ zoom: z }) => setZoom(z)}` on the MapboxView.

    Preserve all existing screen behavior. Do NOT remove or rename any other props on `<TrackLayer>` in either screen. The zoom prop is purely additive.

    Step 2c — Read `apps/mobile-rn/src/map/components/HistoryTerritoryLayer.tsx`. This layer renders all closed sessions as territory overlays (per D-15). Apply the same `simplifyForDisplay` transformation to the union of all session points or, if the layer renders one polygon per session, simplify each session's points individually.

    If the existing HistoryTerritoryLayer uses already-stored polygons (from a `polygons` table or similar), the simplification path is on the polygon coordinates, not point arrays. Adapt accordingly: convert polygon ring → flat coord array → simplifyForDisplay → back to polygon. If the simplification of polygons is non-trivial in this layer's data model, scope to ONLY TrackLayer in this task and add a TODO comment in HistoryTerritoryLayer with `// PHASE1-05: D-15 — apply simplifyForDisplay to history rendering` referencing this plan. Note the deferral in the plan's SUMMARY.md.

    NEVER feed the simplified output into AreaCalculator or any closure-detection code path (per CONTEXT.md D-14, RESEARCH.md Pitfall 3). The raw `points` from the store remain the canonical source for everything except the visual layer. Verify by `grep -n "simplifyForDisplay\\|AreaCalculator" apps/mobile-rn/src/**/*.ts` — `simplifyForDisplay` callers MUST be only `TrackLayer.tsx`, `HistoryTerritoryLayer.tsx`, and the test file (no domain or state callers; screens only PASS the zoom prop, they do not call `simplifyForDisplay` themselves).

    Implements PHASE1-05 (D-14, D-15).
  </action>
  <verify>
    <automated>cd apps/mobile-rn && npm test && npm run typecheck && npm run lint && grep -c "simplifyForDisplay" apps/mobile-rn/src/map/components/TrackLayer.tsx && grep -c "zoom=" apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx</automated>
  </verify>
  <done>TrackLayer.tsx calls `simplifyForDisplay` and accepts a `zoom` prop. TrackerLiveScreen + RunDetailsScreen pass `zoom` to TrackLayer. HistoryTerritoryLayer either calls `simplifyForDisplay` (preferred) or has a TODO documenting the D-15 deferral with rationale. All tests green. Manual smoke on Pixel emulator: record ≥5 minutes (or load a saved long session via Journal) — track renders smoothly, no visible degradation.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

No new trust boundaries. Pure-function utility + visual-layer refactor + screen prop plumbing.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-05-01 | Tampering | simplify(mutate=true) accidentally mutates raw points → corrupts area calc | mitigate | Explicit `mutate: false` in the call; Test 5 in Task 1 asserts the invariant. |
| T-01-05-02 | Information Disclosure | Simplified track reveals less accurate path → privacy improvement (incidental) | accept | Documented as deferred per Phase 4 privacy zones; not the protection mechanism. |

Low security surface.
</threat_model>

<verification>
- `cd apps/mobile-rn && npm test` — full suite passes + new tests.
- `cd apps/mobile-rn && npm run typecheck` + `npm run lint` clean.
- Manual: record a fake 3000-point session via dev simulator; observe smooth panning at zoom 14 (NFR-006 sanity).
- `grep -n "simplifyForDisplay" apps/mobile-rn/src/**/*.{ts,tsx}` — appears in `TrackLayer.tsx`, `HistoryTerritoryLayer.tsx`, and the test file ONLY. NO occurrence in `domain/`, `state/`, or `pipeline/`. (Screen files pass the `zoom` prop only — they do not call `simplifyForDisplay`.)
- `grep -n "AreaCalculator\\|calculateArea" apps/mobile-rn/src/` — confirm callers operate on raw points, not the simplified Feature.
</verification>

<success_criteria>
- All must_haves.truths above are TRUE.
- Field test T7 (PHASE1-05) will validate the FPS improvement on real devices — this plan ships the implementation; the validation row in `tests/FIELD_PROTOCOL.md` lands via Plan 09.
- Atomic commits: Task 1 `feat(phase1): simplifyForDisplay helper (PHASE1-05)`, Task 2 `perf(phase1): wire simplify into TrackLayer + HistoryTerritoryLayer + zoom prop (PHASE1-05)`.
</success_criteria>

<output>
After completion, create `.planning/phases/01-validate-close-territory-core/01-05-SUMMARY.md` capturing:
- Final SIMPLIFY_THRESHOLD_PTS + BASE_TOLERANCE_DEG values (unchanged from CONTEXT.md D-13/D-14 — but record for traceability)
- Whether D-15 (HistoryTerritoryLayer) shipped in this plan or was deferred with TODO
- How the `zoom` prop was sourced in TrackerLiveScreen + RunDetailsScreen (hook path vs. local state + onCameraChanged)
- Manual smoke result (subjective FPS on Pixel emulator at 3000+ points)
- Cross-link: closes PHASE1-05 + P1-D-04 (implementation only — field test verification via Plan 09 T7 row)
</output>
</output>
