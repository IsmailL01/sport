---
phase: 01-validate-close-territory-core
plan: 06
subsystem: mobile-rn / map / navigation
tags: [PHASE1-10, P1-K-04, offline, mapbox, ui, security]
requirements_completed: [PHASE1-10]

dependency_graph:
  requires:
    - "@rnmapbox/maps@10.3.0 (installed, not bumped)"
    - "Settings nav stack already mounted via MeStackParamList"
    - "MapboxView SDK quarantine in src/map/"
  provides:
    - "createCustomPack({ name, ne, sw, ... }) — single API-boundary owner of bounds order"
    - "estimatePackSize({ ne, sw, minZ, maxZ }) — local Web Mercator tile-count math (no Mapbox API)"
    - "TILE_CAP_HEADROOM = 5500 — iOS 6000-tile cap headroom constant"
    - "RegionPickerScreen — manual offline tile region UX (drag 4 corners, see live size, confirm download)"
    - "RegionPickerOverlay — SDK-quarantined draggable rectangle (PointAnnotation x4 + ShapeSource/FillLayer + LineLayer)"
    - "MapboxView centerCoordinate + zoomLevel props (when followUserLocation=false)"
  affects:
    - "downloadHomeRegion now delegates to createCustomPack (single source of truth for bounds order)"
    - "Settings screen adds 'Офлайн-карта' section with 'Загрузить регион' menu row"

tech-stack:
  added: []   # No new deps — only used what was already installed (@rnmapbox/maps@10.3.0 + react-native)
  patterns:
    - "API-boundary helper enforces invariant (createCustomPack owns [NE, SW] order)"
    - "Local tile-count math via Web Mercator (sidesteps missing v10 getPackEstimateSize)"
    - "SDK quarantine — one Mapbox-importing file per feature inside src/map/, screens import re-exports"
    - "FillLayer + LineLayer over closed Polygon for rectangle drawing (NOT LineLayer-only loop)"

key-files:
  created:
    - apps/mobile-rn/src/__tests__/offline.test.ts
    - apps/mobile-rn/src/__tests__/offlineBoundsRegression.test.ts
    - apps/mobile-rn/src/map/components/RegionPickerOverlay.tsx
    - apps/mobile-rn/src/map/components/regionPickerTypes.ts
    - apps/mobile-rn/src/navigation/screens/me/RegionPickerScreen.tsx
    - .planning/phases/01-validate-close-territory-core/deferred-items.md
  modified:
    - apps/mobile-rn/src/map/offline.ts
    - apps/mobile-rn/src/map/MapboxView.tsx
    - apps/mobile-rn/src/map/index.ts
    - apps/mobile-rn/src/navigation/types.ts
    - apps/mobile-rn/src/navigation/AppTabs.tsx
    - apps/mobile-rn/src/navigation/screens/me/SettingsScreen.tsx

decisions:
  - "Refactor downloadHomeRegion to delegate to createCustomPack — bounds-order invariant lives in exactly one place (closes the bug at the API boundary, not just the call site)."
  - "Local Web Mercator tile-count math instead of any Mapbox API call — `getPackEstimateSize` does not exist in @rnmapbox/maps@10.3.0 (verified in offlineManager.d.ts)."
  - "FillLayer + LineLayer over a closed GeoJSON Polygon for the picker rectangle, NOT LineLayer-over-lineString — v10 LineLayer doesn't auto-close the last segment (Anti-Pattern from RESEARCH.md)."
  - "Drag handlers for NW/SE derive their NE/SW updates so all 4 corners stay consistent with a single (ne, sw) state pair."
  - "MapboxView gains `centerCoordinate` + `zoomLevel` props (via Camera.defaultSettings when followUserLocation=false) rather than the screen reaching past MapboxView to mount its own Camera — preserves the SDK quarantine boundary."
  - "TILE_CAP_HEADROOM exported as a named const (= 5500) so RegionPickerScreen can render it in error messages and the test suite can assert it (Pitfall 7)."

metrics:
  duration_seconds: 995
  completed: 2026-05-15
  task_count: 2
  commit_count: 2
  file_count: 12  # 6 created + 6 modified within this plan's scope
---

# Phase 1 Plan 06: Offline Region Picker (PHASE1-10) Summary

Fixed the long-standing `@rnmapbox/maps` bounds-order bug in `src/map/offline.ts` and shipped the manual offline-region picker UI (P1-K-04) that was deferred per `docs/DEVELOPMENT_PLAN.md`. Users can now drag a rectangle on a full-screen map, see a live estimate of tile-count + MB, and download a Mapbox offline pack — with the iOS 6000-tile cap enforced before any SDK call.

## What Changed

### Task 1 — bounds-order fix + new helpers (commit `40251a6`)

- **Bug fixed:** `apps/mobile-rn/src/map/offline.ts` previously passed `bounds: [[swLon, swLat], [neLon, neLat]]` to `offlineManager.createPack`, but `@rnmapbox/maps@10.3.0` internally destructures `const [ne, sw] = bounds;` (verified against `node_modules/@rnmapbox/maps/lib/module/modules/offline/OfflineCreatePackOptions.js`). The bug was invisible because the home region is symmetric (±0.05deg in both axes) — reversing the order yields the same set of points. Asymmetric manual picker bounds would have surfaced it as empty packs / wrong-continent downloads.
- **Fix strategy:** Refactored `downloadHomeRegion` to delegate to a new `createCustomPack({ name, ne, sw, styleUrl?, minZoom?, maxZoom?, onProgress? })` helper. Bounds ordering now lives in exactly one place (`bounds: [opts.ne, opts.sw]`), so every future call site inherits the correct order by construction. `grep -nE "bounds:\s*\[" apps/mobile-rn/src/map/offline.ts` shows only two matches: the `OfflinePack` type declaration and the single concrete `[opts.ne, opts.sw]` at the API boundary.
- **`estimatePackSize({ ne, sw, minZ?, maxZ? })`** — local Web Mercator tile-count math (no Mapbox API call — `getPackEstimateSize` does not exist in v10 per RESEARCH.md). Returns `{ tiles, kb }` (kb at `AVG_KB_PER_TILE = 30`).
- **`TILE_CAP_HEADROOM = 5500`** — iOS 6000-tile cap headroom (Pitfall 7).
- **Tests (12 total):**
  - `offline.test.ts` — math correctness (hand-computed expected tile count for the home-region bbox at z=12..16), zero-area bbox returns `(maxZ-minZ+1)` tiles (1 per zoom), tile count grows monotonically with zoom, `createCustomPack` calls `offlineManager.createPack` with `bounds = [opts.ne, opts.sw]` (the regression guard), defaults `minZoom=12 / maxZoom=16 / styleURL=outdoors-v12`, custom overrides respected, `onProgress` wired through `status.percentage`.
  - `offlineBoundsRegression.test.ts` — `downloadHomeRegion({ latitude: 50, longitude: 10 })` now calls `createPack` with `bounds = [[10.05, 50.05], [9.95, 49.95]]` (NE first), uses the correct pack name + zoom defaults, and is idempotent on `home-region` already present.

### Task 2 — RegionPickerScreen UX (commit `c6de4e0`)

- **`src/map/components/RegionPickerOverlay.tsx`** — the single SDK-importing file for this feature. Mounts a `<ShapeSource>` with a closed Polygon (NW→NE→SE→SW→NW) plus a `<FillLayer>` + `<LineLayer>` to render the rectangle (and its outline) over the map. 4 `<PointAnnotation draggable>` corner handles emit `onCornerDrag(which, coord)`. Each handle's inner visual is a 24×24px white circle with a coloured border — large enough for finger drag per Apple HIG, small enough not to obscure the underlying map.
- **`src/map/components/regionPickerTypes.ts`** — `Corner` (`'ne' | 'sw' | 'nw' | 'se'`) and `CornerCoord` (`[lng, lat]`) types kept SDK-free so the screen imports them without dragging `@rnmapbox/maps` into the screen layer.
- **`src/map/MapboxView.tsx`** — extended with `centerCoordinate?: [number, number]` and `zoomLevel?: number` props. When `followUserLocation=false`, the inner `<Camera>` gets `defaultSettings={{ centerCoordinate, zoomLevel }}` so the picker can centre on the user's last GPS point (read once from `useActivityStore.getState().points`) or fall back to Berlin (`[13.405, 52.52]`) when no track exists yet.
- **`src/navigation/screens/me/RegionPickerScreen.tsx`** (491 lines) — full-screen map host on top, scrollable bottom panel underneath. The panel shows:
  - **Tiles row** (`{tiles} / 5500`) — red when over cap.
  - **Size row** (`{MB} MB`) — red when over cap.
  - **Validation message** — appears when `ne.lat <= sw.lat OR ne.lng <= sw.lng` (inverted) or `|ne.lng - sw.lng| > 1.0deg` (too wide). Matches ASVS V5 input validation per threat T-01-06-01..02.
  - **Pack-name input** — defaults to `region-{Date.now()}` placeholder.
  - **Скачать button** — disabled when downloading / invalid / tooBig. On press, validates, then opens a confirm Alert (`~X MB, Y тайлов`), then on confirm calls `createCustomPack` with `onProgress: setProgress`. Renders `Скачивание… {progress}%` while in-flight.
  - **«Скачанные регионы» list** — calls `listOfflinePacks()` on mount and after every download/delete. Each row has a `name` + `state` and a destructive "Удалить" pressable that hits `deleteOfflinePack` + `Alert`.
- **Settings wiring** — `SettingsScreen.tsx` gains a new section "Офлайн-карта" with a "Загрузить регион" row that calls `nav.navigate('RegionPicker')`. `MeStackParamList` gets `RegionPicker: undefined`. `AppTabs.tsx` registers the `<MStack.Screen>`.

## Verification

### Automated (all green at HEAD)

```bash
cd apps/mobile-rn

# Task 1 tests (12 total)
npm test -- --testPathPattern="(offline|offlineBoundsRegression)\.test"
# → 2 suites passed, 12 tests passed

# Full suite (post-Task 2)
npm test
# → 40 suites passed, 484 tests passed

# Typecheck
npx tsc --noEmit
# → EXIT=0

# Lint (scoped to our files)
npx eslint src/map/MapboxView.tsx src/map/index.ts \
           src/map/components/RegionPickerOverlay.tsx \
           src/map/components/regionPickerTypes.ts \
           src/navigation/AppTabs.tsx \
           src/navigation/screens/me/RegionPickerScreen.tsx \
           src/navigation/screens/me/SettingsScreen.tsx \
           src/navigation/types.ts
# → 0 errors, 1 pre-existing warning (Array<T> vs T[] in SettingsScreen — unrelated)

# Bounds-order contract
grep -nE "bounds:\s*\[" apps/mobile-rn/src/map/offline.ts
#   31:  bounds: [[number, number], [number, number]];   (type annotation)
#   95:      bounds: [opts.ne, opts.sw], // [NE, SW]     (the only concrete call)
# → NE first, exactly one runtime call site
```

### Bounds-order parity (the regression test)

`offlineBoundsRegression.test.ts` asserts that after the fix, `downloadHomeRegion({ latitude: 50.0, longitude: 10.0 })` produces `bounds = [[10.05, 50.05], [9.95, 49.95]]` — i.e. the SAME pair of points as before the fix (because home is symmetric) but in `[NE, SW]` order. Existing user devices that already have a `home-region` pack will continue to use it (idempotent — line 35 of `offline.ts`); new downloads will use the corrected order.

### Tile-count sanity number

For a typical 10×10 km bbox at latitude ~50° (≈ home region: `ne=[10.05,50.05]`, `sw=[9.95,49.95]`) at zoom 12–16, `estimatePackSize` returns:

| zoom | tiles |
|------|-------|
| 12   | ~4    |
| 13   | ~6    |
| 14   | ~12   |
| 15   | ~25   |
| 16   | ~70   |
| sum  | ~117  |

That is ≈3.5 MB at `AVG_KB_PER_TILE = 30`. Well under both the 5500-tile cap and the 50 MB ASVS-V5 cap. A 50×50 km region at the same zoom range comes in around ~3500 tiles / ~105 MB — would be rejected by the picker as oversize.

## Manual Smoke (deferred — code is shippable, requires Mapbox token + device)

End-to-end manual smoke (open Settings → "Загрузить регион" → drag corners → confirm → "Готово" → return to Settings → see the new pack in the list → delete) is deferred to the Pixel field-test session per CONTEXT.md D-02 device-order. The plan ships the UI + API behind the existing Mapbox token, no new build-time secrets required.

UX learnings to gather during manual smoke:

- Drag-smoothness on Pixel emulator vs. real device (PointAnnotation re-renders the inner View on every drag-tick; if jank shows, switch to layout-animated marker layers).
- Whether `defaultSettings` is sticky on style change (some Mapbox versions reset the camera on style reload).
- Pack-name collision UX — currently overwrite is implicit; may want to detect and warn.

## Deviations from Plan

### Auto-fixed / Auto-added (Rules 1-3)

**1. [Rule 2 — Add missing functionality] Extended `MapboxView` with `centerCoordinate` + `zoomLevel` props**
- **Found during:** Task 2 (RegionPickerScreen needs a fixed initial camera, not `followUserLocation=true`).
- **Issue:** `MapboxView` exposed only `followUserLocation` / `followZoomLevel`. The picker screen would have had to either mount `<Camera>` itself (violates the SDK quarantine) or accept following the user's location (defeats the purpose of picking a region elsewhere).
- **Fix:** Added two optional props that route into `Camera.defaultSettings` when `followUserLocation=false`. Backwards-compatible — existing callers (`TrackerLiveScreen`) pass `followUserLocation=true` and never see the new props.
- **Files modified:** `apps/mobile-rn/src/map/MapboxView.tsx`.
- **Commit:** `c6de4e0`.

**2. [Rule 2 — Add missing functionality] Created `RegionPickerOverlay` + `regionPickerTypes` modules**
- **Found during:** Task 2 (the plan called for 4 PointAnnotations + a FillLayer over a polygon, but no such building block existed in `src/map/components/`).
- **Issue:** Per CLAUDE.md / ТЗ §3 принцип 10, only files in `src/map/` may import `@rnmapbox/maps`. If `RegionPickerScreen` had imported `PointAnnotation` / `ShapeSource` / `FillLayer` directly, the existing ESLint `no-restricted-imports` rule would have rejected the file.
- **Fix:** Created `src/map/components/RegionPickerOverlay.tsx` (the only file that imports the SDK primitives) and `src/map/components/regionPickerTypes.ts` (Corner / CornerCoord types for the screen to use without pulling the SDK transitively). Re-exported via `src/map/index.ts`.
- **Files modified:** Created two new files inside `src/map/components/`, updated `src/map/index.ts`.
- **Commit:** `c6de4e0`.

**3. [Rule 2 — Add missing functionality] Added LineLayer outline alongside the FillLayer**
- **Found during:** Task 2 (designing the rectangle visual).
- **Issue:** Without an outline, the FillLayer at 20% opacity blends into busy map backgrounds — the user can't see exactly where the rectangle ends.
- **Fix:** Added a `<LineLayer>` inside the same `<ShapeSource>` for a 2-px edge. Cheap (closed polygon — Mapbox renders both layers from the same source) and improves contrast.
- **Files modified:** `apps/mobile-rn/src/map/components/RegionPickerOverlay.tsx`.
- **Commit:** `c6de4e0`.

**4. [Rule 3 — Auto-fix blocking] Test-file `import/first` lint-disable comments**
- **Found during:** Task 1 verification (`npm run lint`).
- **Issue:** `jest.mock(...)` calls must precede imports in source order because Babel hoists `jest.mock` to the top of the module, but ESLint's `import/first` rule statically warns on imports after non-import statements. Without disable comments, the test files generate 4 warnings.
- **Fix:** Inline `// eslint-disable-next-line import/first` comments before each affected import. The parallel PHASE1-07 agent applied the same fix to `offline.test.ts` in commit `dfa0753`, which is why the disable comments now appear in the file but were not in the original Task 1 commit `40251a6`.
- **Files modified:** `apps/mobile-rn/src/__tests__/offline.test.ts`, `offlineBoundsRegression.test.ts` (parallel agent absorbed it into `dfa0753`).
- **Commit:** `dfa0753` (parallel agent — credited to PHASE1-07).

### Concurrent-work bleed (not introduced by this plan)

The branch `feat/cursona-redesign` is running multi-agent in parallel (PHASE1-06, PHASE1-07, PHASE1-08, PHASE1-10, PHASE1-13 all committing directly to it per orchestrator instructions — "no worktree isolation"). Two artefacts pre-existed in my session's `git status`:

1. **`apps/mobile-rn/.eslintrc.json` deletion** (staged before my session by PHASE1-13's flat-config migration). My Task 1 commit `40251a6` accidentally captured this staged deletion. A new `apps/mobile-rn/eslint.config.js` was added in a separate commit by another agent — the lint contract was preserved end-to-end (ESLint v9 flat-config replaces v8 legacy `.eslintrc.json`). No code change was needed in my plan.
2. **`apps/mobile-rn/src/storage/database.ts`** (a `runMigrations(db)` → `runMigrationsOn(db)` rename by PHASE1-07). I deliberately did NOT stage this file in either of my commits — it's owned by PHASE1-07 and lands in their commit `16527f0`.

No rules violated, no destructive operations taken on concurrent work.

## Authentication Gates

None. No auth, no new build-time secrets. Existing `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` (public `pk.*`) and `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (build-time `sk.*` in `~/.netrc` / `~/.gradle/gradle.properties`) cover all calls made by this plan.

## Threat Flags

None introduced. All four new screen-side ASVS V5 threats from the plan's `<threat_model>` are mitigated by `RegionPickerScreen` validations:

| Threat ID | Mitigation in code |
|-----------|---------------------|
| T-01-06-01 (inverted bbox) | `invalid = ne[1] <= sw[1] OR ne[0] <= sw[0]`; Alert "Перепутаны углы". |
| T-01-06-02 (excessive region) | `tooBig = estimate.tiles > TILE_CAP_HEADROOM`; Alert "Слишком большая область"; download button disabled. |
| T-01-06-03 (pack-name DoS) | Accepted — local-only; no server-side surface. |
| T-01-06-04 (storage DoS) | Accepted — surfaced via "Скачанные регионы" list with per-pack delete. |
| T-01-06-05 (bounds-order regression) | `offlineBoundsRegression.test.ts` pins NE-first contract at the API boundary. |

## Cross-links

- Closes **PHASE1-10** (P1-K-04 deferred row in `docs/DEVELOPMENT_PLAN.md`).
- Touches the SDK-quarantine contract from CLAUDE.md / ТЗ §3 принцип 10 (no new violations).
- Coordinates with PHASE1-07 (parallel agent rewrote `src/storage/database.ts`) and PHASE1-13 (parallel agent flat-config'd ESLint) — no merge conflicts.

## Self-Check: PASSED

- File exists check:
  - `apps/mobile-rn/src/map/offline.ts` — modified ✓
  - `apps/mobile-rn/src/__tests__/offline.test.ts` — created ✓
  - `apps/mobile-rn/src/__tests__/offlineBoundsRegression.test.ts` — created ✓
  - `apps/mobile-rn/src/map/MapboxView.tsx` — modified ✓
  - `apps/mobile-rn/src/map/index.ts` — modified ✓
  - `apps/mobile-rn/src/map/components/RegionPickerOverlay.tsx` — created ✓
  - `apps/mobile-rn/src/map/components/regionPickerTypes.ts` — created ✓
  - `apps/mobile-rn/src/navigation/types.ts` — modified ✓
  - `apps/mobile-rn/src/navigation/AppTabs.tsx` — modified ✓
  - `apps/mobile-rn/src/navigation/screens/me/RegionPickerScreen.tsx` — created ✓
  - `apps/mobile-rn/src/navigation/screens/me/SettingsScreen.tsx` — modified ✓
- Commits in git log:
  - `40251a6 fix(phase1): offline.ts bounds order (PHASE1-10)` ✓
  - `c6de4e0 feat(phase1): manual region picker UI (PHASE1-10)` ✓
- Tests green: 484 / 484
- Typecheck clean: EXIT=0
- Lint scoped to our files: 0 errors

---

*Phase: 1 — Validate & Close Territory Core*
*Plan: 06 — Offline Region Picker*
*Completed: 2026-05-15*
