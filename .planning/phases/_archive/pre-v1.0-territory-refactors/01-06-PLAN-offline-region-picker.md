---
phase: 01-validate-close-territory-core
plan: 06
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile-rn/src/map/offline.ts
  - apps/mobile-rn/src/navigation/screens/me/RegionPickerScreen.tsx
  - apps/mobile-rn/src/navigation/screens/me/SettingsScreen.tsx
  - apps/mobile-rn/src/navigation/types.ts
  - apps/mobile-rn/src/navigation/AppTabs.tsx
  - apps/mobile-rn/src/__tests__/offline.test.ts
  - apps/mobile-rn/src/__tests__/offlineBoundsRegression.test.ts
autonomous: true
requirements: [PHASE1-10]
maps_to_existing_plan: P1-K-04 (manual region download UI — "отложен" per DEVELOPMENT_PLAN.md)

must_haves:
  truths:
    - "offline.ts has a NEW createCustomPack({ name, ne, sw, ... }) function that passes bounds in the CORRECT [NE, SW] order per @rnmapbox/maps v10 contract"
    - "offline.ts has an estimatePackSize({ ne, sw, minZ, maxZ }) function returning { tiles, kb } via local Web Mercator math (no Mapbox API call)"
    - "downloadHomeRegion is REFACTORED to call createCustomPack internally OR the existing [sw, ne] order is reversed to [ne, sw] (bug fix); a regression test asserts the home-region bbox is identical to before (because symmetric)"
    - "RegionPickerScreen exists at apps/mobile-rn/src/navigation/screens/me/RegionPickerScreen.tsx — mounts MapboxView with 4 corner PointAnnotations + a FillLayer rectangle"
    - "Picker rejects regions where estimatePackSize().tiles > 5500 (iOS 6000-tile cap headroom — Pitfall 7)"
    - "Picker validates ne.lat > sw.lat AND |ne.lng - sw.lng| ≤ 1.0deg AND area ≤ ~50 MB (ASVS V5 input validation per RESEARCH.md §Security Domain)"
    - "Settings screen has a 'Загрузить регион' menu row that navigates to RegionPickerScreen"
    - "Tests cover: tile count math correctness for a known bbox; tile-cap rejection; bounds-order regression vs current home region"
  artifacts:
    - path: apps/mobile-rn/src/navigation/screens/me/RegionPickerScreen.tsx
      provides: "Manual offline region picker screen with draggable-corner UX"
      min_lines: 150
    - path: apps/mobile-rn/src/__tests__/offlineBoundsRegression.test.ts
      provides: "Regression test asserting bounds-order fix does not break home-region parity"
      min_lines: 30
  key_links:
    - from: apps/mobile-rn/src/map/offline.ts
      to: "@rnmapbox/maps offlineManager.createPack"
      via: bounds prop = [opts.ne, opts.sw]
      pattern: "bounds:\\s*\\[opts\\.ne, opts\\.sw\\]|bounds:\\s*\\[ne, sw\\]"
    - from: apps/mobile-rn/src/navigation/screens/me/RegionPickerScreen.tsx
      to: apps/mobile-rn/src/map/offline.ts
      via: createCustomPack({ name, ne, sw, onProgress })
      pattern: "createCustomPack"
    - from: apps/mobile-rn/src/navigation/screens/me/SettingsScreen.tsx
      to: apps/mobile-rn/src/navigation/screens/me/RegionPickerScreen.tsx
      via: nav.navigate('RegionPicker')
      pattern: "nav\\.navigate\\(['\"]RegionPicker"
---

<objective>
Per CONTEXT.md D-23..D-26 + RESEARCH.md §Pitfall 1 (bounds bug) and §Pitfall 7 (iOS tile cap): (1) FIX the long-standing bounds-order bug in `offline.ts` where `[sw, ne]` is passed to `@rnmapbox/maps@10.3.0` but the SDK expects `[ne, sw]` — this is currently invisible because the home region is symmetric (Pitfall 1) but will produce empty/inverted packs as soon as we ship asymmetric manual picker bounds; (2) introduce a new `createCustomPack({ name, ne, sw, ... })` helper that enforces the order at the API boundary; (3) introduce `estimatePackSize({ ne, sw, minZ, maxZ })` via local Web Mercator math (no Mapbox API call — `getPackEstimateSize` is NOT available in v10 per RESEARCH.md); (4) build the `RegionPickerScreen` with a draggable-rectangle UX (4 PointAnnotation corner handles + FillLayer rectangle). Wire it into the Settings screen.

Purpose: NFR / functional requirement that the user can choose offline tile coverage beyond the auto-home region (10×10 km around the first GPS fix). Critical for trail / multi-city runners.
Output: Bug-fixed `offline.ts` with two new exports + regression test, new `RegionPickerScreen.tsx` + nav wiring, offline tests for the math + bounds-order regression.
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

@apps/mobile-rn/src/map/offline.ts
@apps/mobile-rn/src/map/MapboxView.tsx
@apps/mobile-rn/src/map/index.ts
@apps/mobile-rn/src/navigation/screens/me/SettingsScreen.tsx
@apps/mobile-rn/src/navigation/types.ts
@apps/mobile-rn/src/navigation/AppTabs.tsx
@apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx

<interfaces>
<!-- offline.ts new exports (NEW). -->

```typescript
// apps/mobile-rn/src/map/offline.ts (EXTEND)
export async function createCustomPack(opts: {
  name: string;
  ne: [number, number]; // [lng, lat]
  sw: [number, number]; // [lng, lat]
  styleUrl?: string;
  minZoom?: number; // default 12
  maxZoom?: number; // default 16
  onProgress?: (percentage: number) => void;
}): Promise<void>;

export function estimatePackSize(opts: {
  ne: [number, number];
  sw: [number, number];
  minZ?: number;
  maxZ?: number;
}): { tiles: number; kb: number };

export const TILE_CAP_HEADROOM = 5500;
```

<!-- Existing offline.ts functions (preserve external contract). -->

```typescript
// apps/mobile-rn/src/map/offline.ts (existing — bounds bug to fix)
export async function downloadHomeRegion(opts: { latitude: number; longitude: number; ... }): Promise<void>;
export async function listOfflinePacks(): Promise<OfflinePack[]>;
export async function deleteOfflinePack(name: string): Promise<void>;
export async function deleteHomeRegion(): Promise<void>;
```

<!-- Navigation types (EXTEND). -->

```typescript
// apps/mobile-rn/src/navigation/types.ts (EXTEND)
export type MeStackParamList = {
  // ... existing routes
  RegionPicker: undefined;
};
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fix offline.ts bounds-order bug + add createCustomPack + estimatePackSize + tests</name>
  <files>apps/mobile-rn/src/map/offline.ts, apps/mobile-rn/src/__tests__/offline.test.ts, apps/mobile-rn/src/__tests__/offlineBoundsRegression.test.ts</files>
  <behavior>
    **offline.test.ts:**
    - Test 1: `estimatePackSize({ ne: [10.05, 50.05], sw: [9.95, 49.95], minZ: 12, maxZ: 16 })` returns a positive tile count consistent with manual Web Mercator math for a ~10×10 km region (known-good baseline — compute the expected number once via a separate online calculator OR via the same formula written by hand and assert the function matches that exact number).
    - Test 2: `estimatePackSize` returns `tiles: 0` for zero-area bounds (`ne === sw`).
    - Test 3: `estimatePackSize` scales roughly 4x per zoom level (each zoom level quadruples tile density).
    - Test 4: `createCustomPack` calls `offlineManager.createPack` with `bounds: [opts.ne, opts.sw]` — assert the exact order by spying on the mocked offlineManager.
    - Test 5: `createCustomPack` defaults `minZoom: 12, maxZoom: 16, styleUrl: 'mapbox://styles/mapbox/outdoors-v12'` when those options are omitted.

    **offlineBoundsRegression.test.ts:**
    - Test 1: Calling `downloadHomeRegion({ latitude: 50.0, longitude: 10.0 })` (post-bounds-fix) results in `offlineManager.createPack` being called with bounds equal to the bounds it would have computed before the fix — because the home region is symmetric (±0.05 deg), reversing the order yields the same set of points but in the correct [NE, SW] order. Assert: `bounds[0] = [10.05, 50.05]` (NE), `bounds[1] = [9.95, 49.95]` (SW). This proves the bug fix does not break existing user packs.
  </behavior>
  <action>
    Per RESEARCH.md §Pattern 4 + §Pitfall 1 + PATTERNS.md §offline.ts (lines 329-365):

    Step 1a — FIX the bounds-order bug in the existing `downloadHomeRegion`. Read current `apps/mobile-rn/src/map/offline.ts:43-52`. Replace:
    ```
    bounds: [
      [swLon, swLat],
      [neLon, neLat],
    ],
    ```
    with:
    ```
    bounds: [
      [neLon, neLat], // [NE, SW] — verified in @rnmapbox/maps v10 OfflineCreatePackOptions._makeLatLngBounds destructures const [ne, sw] = bounds
      [swLon, swLat],
    ],
    ```
    OR refactor `downloadHomeRegion` to delegate to `createCustomPack` (preferred — single source of truth for ordering):
    ```
    export async function downloadHomeRegion(opts) {
      const existing = await listOfflinePacks();
      if (existing.some((p) => p.name === HOME_PACK_NAME)) return;
      const ne: [number, number] = [opts.longitude + HOME_PACK_HALF_SIDE_DEG, opts.latitude + HOME_PACK_HALF_SIDE_DEG];
      const sw: [number, number] = [opts.longitude - HOME_PACK_HALF_SIDE_DEG, opts.latitude - HOME_PACK_HALF_SIDE_DEG];
      await createCustomPack({ name: HOME_PACK_NAME, ne, sw, styleUrl: opts.styleUrl, minZoom: opts.minZoom, maxZoom: opts.maxZoom, onProgress: opts.onProgress });
    }
    ```

    Step 1b — Add `createCustomPack` (PATTERNS.md lines 335-355, EXACT code from RESEARCH.md Pattern 4):
    ```
    export async function createCustomPack(opts: {
      name: string;
      ne: [number, number];
      sw: [number, number];
      styleUrl?: string;
      minZoom?: number;
      maxZoom?: number;
      onProgress?: (percentage: number) => void;
    }): Promise<void> {
      await offlineManager.createPack(
        {
          name: opts.name,
          styleURL: opts.styleUrl ?? DEFAULT_STYLE,
          minZoom: opts.minZoom ?? 12,
          maxZoom: opts.maxZoom ?? 16,
          bounds: [opts.ne, opts.sw], // [NE, SW] — verified
        },
        (_region, status) => opts.onProgress?.(status.percentage ?? 0),
        (_region, error) => console.error('[offline] custom pack error', error),
      );
    }
    ```

    Step 1c — Add `estimatePackSize` (PATTERNS.md / RESEARCH.md lines 358-371):
    ```
    export const TILE_CAP_HEADROOM = 5500;
    const AVG_KB_PER_TILE = 30;

    export function estimatePackSize(opts: {
      ne: [number, number];
      sw: [number, number];
      minZ?: number;
      maxZ?: number;
    }): { tiles: number; kb: number } {
      const { ne, sw, minZ = 12, maxZ = 16 } = opts;
      let tiles = 0;
      for (let z = minZ; z <= maxZ; z++) {
        const n = Math.pow(2, z);
        const x1 = Math.floor(((sw[0] + 180) / 360) * n);
        const x2 = Math.floor(((ne[0] + 180) / 360) * n);
        const latRad1 = (ne[1] * Math.PI) / 180;
        const latRad2 = (sw[1] * Math.PI) / 180;
        const y1 = Math.floor(((1 - Math.log(Math.tan(latRad1) + 1 / Math.cos(latRad1)) / Math.PI) / 2) * n);
        const y2 = Math.floor(((1 - Math.log(Math.tan(latRad2) + 1 / Math.cos(latRad2)) / Math.PI) / 2) * n);
        tiles += Math.abs(x2 - x1 + 1) * Math.abs(y2 - y1 + 1);
      }
      return { tiles, kb: tiles * AVG_KB_PER_TILE };
    }
    ```

    Step 1d — Tests. `apps/mobile-rn/src/__tests__/offline.test.ts` follows PATTERNS.md §offline.test.ts (lines 596-614):
    ```
    jest.mock('@rnmapbox/maps', () => ({
      offlineManager: {
        createPack: jest.fn((options, _onProgress, _onError) => Promise.resolve()),
        getPacks: jest.fn(() => Promise.resolve([])),
        deletePack: jest.fn(),
      },
    }));
    ```

    Then test bodies per Behavior section above. For Test 1 (math correctness): pick a small, well-known bbox (e.g., a 1×1 deg square at the equator at zoom 12 should have exactly `2^12 * 1/360` tiles in x and similar in y — calculate the expected value by hand once, then hardcode it in the test).

    `apps/mobile-rn/src/__tests__/offlineBoundsRegression.test.ts` — same mock setup. Single test:
    ```
    it('downloadHomeRegion passes bounds in [NE, SW] order after the fix', async () => {
      const createPack = require('@rnmapbox/maps').offlineManager.createPack as jest.Mock;
      createPack.mockClear();
      await downloadHomeRegion({ latitude: 50.0, longitude: 10.0 });
      const callArgs = createPack.mock.calls[0][0]; // first positional arg
      expect(callArgs.bounds).toEqual([
        [10.05, 50.05], // NE
        [9.95, 49.95],  // SW
      ]);
    });
    ```

    NEVER pass `[sw, ne]` order anywhere in offline.ts after this task — every call site to `offlineManager.createPack` MUST go through `createCustomPack` OR pass bounds explicitly as `[opts.ne, opts.sw]`. Verify via `grep -nE "bounds:\\s*\\[" apps/mobile-rn/src/map/offline.ts` — every match must show NE coords first.

    NEVER mock `@rnmapbox/maps` outside test files — the existing `no-restricted-imports` rule blocks production code from importing it outside `src/map/`.

    Implements PHASE1-10 offline-layer (D-23..D-26 SDK boundary fix).
  </action>
  <verify>
    <automated>cd apps/mobile-rn && npm test -- --testPathPattern="(offline|offlineBoundsRegression)\\.test" && grep -nE "bounds:\\s*\\[" apps/mobile-rn/src/map/offline.ts</automated>
  </verify>
  <done>Bug is fixed (grep shows NE coords first in every bounds line of offline.ts). createCustomPack + estimatePackSize exported with correct types. Regression test green (downloadHomeRegion bounds parity verified). offline.test.ts has ≥5 tests all green.</done>
</task>

<task type="auto">
  <name>Task 2: Build RegionPickerScreen with draggable corners + size estimator UX</name>
  <files>apps/mobile-rn/src/navigation/screens/me/RegionPickerScreen.tsx, apps/mobile-rn/src/navigation/types.ts, apps/mobile-rn/src/navigation/screens/me/SettingsScreen.tsx, apps/mobile-rn/src/navigation/AppTabs.tsx</files>
  <action>
    Per PATTERNS.md §RegionPickerScreen.tsx (lines 369-420) + RESEARCH.md Pattern 4 + CONTEXT.md D-23..D-26:

    Step 2a — Create `apps/mobile-rn/src/navigation/screens/me/RegionPickerScreen.tsx`. Module header:
    ```
    // RegionPickerScreen: manual offline-tile-region picker с draggable-rectangle overlay.
    // Phase 1 / PHASE1-10. См. CONTEXT.md D-23..D-26, ТЗ §10.3, DEVELOPMENT_PLAN.md §3 P1-K-04.
    // ВАЖНО: never import @rnmapbox/maps directly — go through MapboxView re-export.
    ```

    Imports (per PATTERNS.md lines 374-381):
    ```
    import { useMemo, useState } from 'react';
    import { Alert, Pressable, Text, TextInput, View } from 'react-native';
    import { useNavigation } from '@react-navigation/native';
    import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

    import { Icon, useTheme } from '../../../design';
    import type { MeStackParamList } from '../../types';
    import { MapboxView, LocationPuckLayer } from '../../../map';
    import { createCustomPack, estimatePackSize, TILE_CAP_HEADROOM } from '../../../map/offline';
    ```

    The MapboxView re-export from `src/map/index.ts` is the only allowed entry — confirm `LocationPuckLayer`, `PointAnnotation`, `ShapeSource`, `FillLayer` are exported there OR ADD re-exports for any missing ones (must be done inside `src/map/index.ts`, never bypass to `@rnmapbox/maps`).

    Body structure:
    1. Header with back-button + title "Выбор области" + (right-side) "Скачать" pressable disabled until valid bounds (PATTERNS.md lines 393-403 pattern).
    2. Full-screen `<MapboxView followUserLocation={false} centerCoordinate={[10.0, 50.0]} zoomLevel={13}>` (initial center can be the user's last known location — read from `useActivityStore.getState().points[0]` if available, else default to some city center).
    3. Inside the map: `<LocationPuckLayer />` + 4 `<PointAnnotation>` corner handles (top-left, top-right, bottom-left, bottom-right) with `draggable={true}` prop. Each handle's `onDragEnd` updates ONE coord in state.
    4. A `<ShapeSource id="picker-rect" shape={polygonFeature}><FillLayer style={{ fillColor: '#10B981', fillOpacity: 0.2 }} /></ShapeSource>` — the polygon recomputed from the 4 corners (use `@turf/helpers` `polygon([[ne, [ne.lng, sw.lat], sw, [sw.lng, ne.lat], ne]])` to form a closed ring). NEVER use `LineLayer` for the rectangle — per RESEARCH.md Anti-Patterns line 440 ("Drawing the picker rectangle with LineLayer over lineString of 4 corners — fails to close because LineLayer does not draw the closing edge unless coords are looped. Use FillLayer + Polygon instead.").
    5. Below the map: a panel showing estimated `tiles` + `MB` + an input row for the pack name (default `region-<timestamp>`).
    6. "Скачать" button calls `handleDownload`.

    `handleDownload` logic (per PATTERNS.md lines 406-417):
    ```
    const handleDownload = () => {
      if (ne.lat <= sw.lat || Math.abs(ne.lng - sw.lng) > 1.0) {
        Alert.alert('Неверные границы', 'Перепутаны углы или область слишком большая (>1 градуса).');
        return;
      }
      const { tiles, kb } = estimatePackSize({ ne: [ne.lng, ne.lat], sw: [sw.lng, sw.lat] });
      if (tiles > TILE_CAP_HEADROOM) {
        Alert.alert('Слишком большая область', `~${tiles} тайлов превышают лимит ${TILE_CAP_HEADROOM} (iOS).`);
        return;
      }
      const sizeMb = (kb / 1024).toFixed(1);
      Alert.alert('Скачать?', `~${sizeMb} MB, ${tiles} тайлов`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Скачать', onPress: async () => {
            const finalName = packName.trim() || `region-${Date.now()}`;
            await createCustomPack({
              name: finalName,
              ne: [ne.lng, ne.lat],
              sw: [sw.lng, sw.lat],
              onProgress: setProgress,
            });
            Alert.alert('Готово', `Регион «${finalName}» скачан.`);
            nav.goBack();
          }
        },
      ]);
    };
    ```

    Step 2b — Wire route registration. In `apps/mobile-rn/src/navigation/types.ts`: add `RegionPicker: undefined` to `MeStackParamList` (per PATTERNS.md line 420). In `apps/mobile-rn/src/navigation/AppTabs.tsx` (or wherever `MeStack` is defined): register `<Stack.Screen name="RegionPicker" component={RegionPickerScreen} />` alongside `SettingsScreen`.

    Step 2c — Wire the menu entry. In `apps/mobile-rn/src/navigation/screens/me/SettingsScreen.tsx`: add a new menu row "Загрузить регион" (Russian, matches existing menu style) that navigates `nav.navigate('RegionPicker')`. Pattern for the menu row: copy from any existing Settings row (e.g., theme/units rows) — read the file to find the right shape. Per PATTERNS.md D-25: existing packs are listed in Settings via `listOfflinePacks()`; if not already present, ADD a "Скачанные регионы" expandable section that calls `listOfflinePacks()` on mount and shows `name + size + delete` rows.

    NEVER import `@rnmapbox/maps` directly from RegionPickerScreen — `no-restricted-imports` will reject the file. ALWAYS go through `src/map/index.ts` re-exports. If `src/map/index.ts` is missing `PointAnnotation` or `FillLayer` re-exports, ADD them at the top of `src/map/index.ts` (e.g., `export { PointAnnotation, ShapeSource, FillLayer } from '@rnmapbox/maps';`) — that single file is the only place inside `src/map/` allowed to import from the SDK.

    Implements PHASE1-10 UX (D-23..D-26).
  </action>
  <verify>
    <automated>cd apps/mobile-rn && npm test && npm run typecheck && npm run lint && grep -c "createCustomPack" apps/mobile-rn/src/navigation/screens/me/RegionPickerScreen.tsx</automated>
  </verify>
  <done>RegionPickerScreen renders MapboxView + 4 corner handles + FillLayer rectangle + Скачать button + size estimator panel. Settings has a "Загрузить регион" menu row navigating to the picker. typecheck + lint clean (no `@rnmapbox/maps` imports outside src/map/). Manual smoke on Pixel emulator: navigate to picker → drag corners → see size estimate → tap "Скачать" → confirm → see "Готово" alert → return to Settings → existing-packs list shows the new pack.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User-controlled picker bounds → Mapbox offlineManager (storage + network cost) | The picker takes user-drawn rectangle coordinates → estimatePackSize gate → createCustomPack which downloads tiles. Untrusted input is the picker UI; the gate prevents abuse. |
| `~/.netrc` / `gradle.properties` Mapbox token → Mapbox tile API | Build-time token cost. Out of scope for this plan (covered by Plan 08 PHASE1-13). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-06-01 | Tampering | User picks an inverted bbox (`ne.lat < sw.lat`) | mitigate | Picker validates `ne.lat > sw.lat AND |ne.lng - sw.lng| ≤ 1.0deg` per ASVS V5 input validation. Alert "Неверные границы" rejects before Mapbox call. |
| T-01-06-02 | Tampering | User picks an excessive region → cost / iOS pack-tile cap exceeded | mitigate | estimatePackSize gate at TILE_CAP_HEADROOM=5500 tiles (iOS 6000 cap with 500 headroom). Rejected before Mapbox call. |
| T-01-06-03 | Information Disclosure | Pack name field accepts arbitrary user text → stored in Mapbox SDK | accept | Pack name is local to the device (Mapbox `offlineManager` stores it in the iOS/Android offline cache). No server-side exposure. |
| T-01-06-04 | Denial of Service | Repeated `createCustomPack` calls overwhelm device storage | accept | User-initiated; documented in Settings UX (list of packs + delete button). |
| T-01-06-05 | Tampering | Bounds-order regression silently produces empty packs | mitigate | offlineBoundsRegression.test.ts asserts NE-first order after fix; the bug is closed at the API boundary (createCustomPack enforces `[opts.ne, opts.sw]`). |

ASVS V5 (Input Validation) applies. ASVS V7 (Error Handling) — Alerts surface failures; `console.error('[offline] ...')` logs internally (per PATTERNS.md §Logging).
</threat_model>

<verification>
- `cd apps/mobile-rn && npm test` — full suite green; new tests cover bounds-order regression + math.
- `cd apps/mobile-rn && npm run typecheck` clean.
- `cd apps/mobile-rn && npm run lint` clean — `@rnmapbox/maps` only inside `src/map/`.
- Manual smoke: open Settings → "Загрузить регион" → draw a small region → tap Скачать → confirm → see "Готово" → returned pack appears in Settings list → delete it → confirms gone.
- `grep -nE "bounds:\\s*\\[" apps/mobile-rn/src/map/offline.ts` — every match has NE coords first.
- `grep -nE "ne|sw" apps/mobile-rn/src/__tests__/offlineBoundsRegression.test.ts` — regression test asserts the exact NE/SW ordering.
</verification>

<success_criteria>
- All must_haves.truths above are TRUE.
- Bounds bug (Pitfall 1) closed at the API boundary; regression test pins the contract.
- Manual region picker UX works on Pixel emulator end-to-end.
- Atomic commits per task: Task 1 `fix(phase1): correct offlineManager bounds order + add createCustomPack/estimatePackSize (PHASE1-10)`, Task 2 `feat(phase1): RegionPickerScreen with draggable corners (PHASE1-10)`.
</success_criteria>

<output>
After completion, create `.planning/phases/01-validate-close-territory-core/01-06-SUMMARY.md` capturing:
- Confirmation that bounds order is now `[NE, SW]` everywhere in offline.ts
- Tile count predicted for a typical 10×10 km region at zooms 12-16 (sanity number)
- UX learnings on draggable corners (smoothness on Pixel emulator)
- Cross-link: closes PHASE1-10 + P1-K-04
</output>
