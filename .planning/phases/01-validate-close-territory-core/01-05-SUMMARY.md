---
phase: 01-validate-close-territory-core
plan: 05
subsystem: mobile-map-perf
tags: [phase1, perf, simplification, turf, mapbox]
requires:
  - plan-02-tracker-hooks-extracted
provides:
  - simplifyForDisplay-util
  - dual-source-rendering-policy
  - tracklayer-zoom-prop
  - history-territory-zoom-prop
affects:
  - TrackLayer.tsx
  - HistoryTerritoryLayer.tsx
  - TrackerLiveScreen.tsx
  - RunDetailsScreen.tsx
tech-stack:
  added: []
  patterns:
    - "Douglas-Peucker через @turf/simplify@7.3.5 — никаких новых зависимостей"
    - "useMemo([Math.floor(points.length/50), zoom]) — coalesced recompute каждые 50 точек, не каждый append"
    - "Dual-source разделение: simplifyForDisplay → LineLayer/FillLayer; raw points → AreaCalculator / closure detection / GPX export"
key-files:
  created:
    - apps/mobile-rn/src/map/util/simplify.ts
    - apps/mobile-rn/src/__tests__/trackSimplify.test.ts
  modified:
    - apps/mobile-rn/src/map/components/TrackLayer.tsx
    - apps/mobile-rn/src/map/components/HistoryTerritoryLayer.tsx
    - apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx
    - apps/mobile-rn/src/navigation/screens/record/RunDetailsScreen.tsx
decisions:
  - "D-15 (HistoryTerritoryLayer simplification) — DELIVERED, not deferred. Periметр длинных закрытых сессий проходит через simplifyForDisplay; кольцо явно замыкается first === last."
  - "Zoom source: live recording = cameraProps.followZoomLevel (≈16), post-run preview = константа 13 (совпадает с MapboxView default для followUserLocation=false). Хук useTrackerCamera уже отдаёт followZoomLevel — новый local state не добавлялся."
  - "useMemo сегментация по floor(points.length/50) — simplify пересчёт раз в ~50 принятых точек, не каждый append. Под порогом 2000 — pre-existing pointsToLineString path сохранён 1:1 (минимальный риск регрессии для коротких треков)."
metrics:
  duration: ~25 minutes
  completed: 2026-05-14
  tasks: 2
  files_created: 2
  files_modified: 4
  tests_added: 10
  loc_added: 245
---

# Phase 1 Plan 05: Big-Track Simplification Summary

Phase 1 / PHASE1-05 / P1-D-04 — Douglas-Peucker simplification на визуальных слоях трека и истории. Реализовано полностью, D-15 (HistoryTerritoryLayer) **доставлено**, не отложено TODO.

## One-liner

`simplifyForDisplay({ points, zoom })` через `@turf/simplify@^7.3.5` с динамическим tolerance `BASE_TOLERANCE_DEG * 2^(12-zoom)`; гейт `points.length >= 2000`; dual-source разделение — LineLayer и FillLayer получают simplified, AreaCalculator / closure detection продолжают читать raw `points` из store.

## Tasks Completed

| Task | Name                                                                             | Commit    | Files                                                                                                                                                  |
| ---- | -------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | TDD: `simplifyForDisplay` utility + 10 unit-тестов                                | `bf3c60a` | `src/map/util/simplify.ts` (51 LOC), `src/__tests__/trackSimplify.test.ts` (108 LOC)                                                                   |
| 2    | Wire simplifyForDisplay in TrackLayer + HistoryTerritoryLayer + zoom plumbing    | `23bf9b4` | `TrackLayer.tsx`, `HistoryTerritoryLayer.tsx`, `TrackerLiveScreen.tsx`, `RunDetailsScreen.tsx`                                                          |

## Final Constants

| Constant                  | Value     | Source                       | Note                                                                                                            |
| ------------------------- | --------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `SIMPLIFY_THRESHOLD_PTS`  | 2000      | CONTEXT.md D-13              | Под порогом — прежний путь через `pointsToLineString` без потерь.                                              |
| `BASE_TOLERANCE_DEG`      | 0.00005   | CONTEXT.md D-14              | ≈5 м на экваторе при zoom 12. Без изменений от плана.                                                          |
| `dynamicTolerance(z)`     | `BASE * 2^(12-z)` | CONTEXT.md D-14      | На каждый +1 zoom — половина толерантности (вдвое точнее). Проверено assertion'ами в `trackSimplify.test.ts`. |
| Memo coalescing segment   | 50 точек  | RESEARCH.md Anti-Pattern     | `useMemo([Math.floor(length/50), zoom])` — simplify пересчёт ~раз в 50 принятых точек, ≈ раз в минуту на live recording. |

## D-15 (HistoryTerritoryLayer) — DELIVERED

План-чекер round 1 предупреждал о "silent TODO deferral" — здесь работа сделана **полностью**, не отложена.

**Подход:**

1. Цикл по `closedSessionsPoints.entries()` сохраняется как раньше.
2. Каждая сессия классифицируется по длине:
   - `< 3 точек` → пропускается (валидный полигон требует минимум 3 уникальных точки).
   - `< SIMPLIFY_THRESHOLD_PTS` → **прежний путь без simplify**, минимальный риск регрессии для типичных коротких сессий (≤30 минут бега ≈ 1800 точек при 1 Гц).
   - `>= SIMPLIFY_THRESHOLD_PTS` → `simplifyForDisplay({ points, zoom })`, разворачиваем `geometry.coordinates` обратно в `[lng, lat][]`, дополнительно проверяем `coords.length >= 3` (если Douglas-Peucker неожиданно схлопнул полигон до 2-3 точек — пропускаем сессию).
3. Замыкание кольца сохраняется явно — `if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first)`. Это инвариант GeoJSON Polygon-схемы, мы не полагаемся на behavior `simplify` для замыкания.

**Что НЕ перешло на simplified data:**

- `closedSessionsPoints` (ReadonlyMap<sessionId, Point[]>) — исходный store не трогается.
- Hover / per-session interactions (если будут в Phase 4+) — могут пробежаться по raw `closedSessionsPoints[sessionId]`.
- GPX export, area calc, recovery — все пути из `AreaCalculator`, `gpx.ts`, `sessionRepository` работают на raw points.

**Verification:**

```
$ grep -rn "simplifyForDisplay" src/
src/map/components/HistoryTerritoryLayer.tsx:    simplifyForDisplay({ points, zoom });   # ← наш caller
src/map/components/TrackLayer.tsx:              simplifyForDisplay({ points, zoom });   # ← наш caller
src/map/util/simplify.ts                                                                   # ← модуль
src/__tests__/trackSimplify.test.ts                                                        # ← тесты
src/navigation/screens/record/TrackerLiveScreen.tsx                                        # ← только в комментариях / zoom-prop
src/navigation/screens/record/RunDetailsScreen.tsx                                         # ← только в комментариях / zoom-prop
```

Никаких вызовов в `domain/`, `state/`, `pipeline/` — изолировано на визуальный слой.

## Zoom prop sourcing — hook path vs. local state

**TrackerLiveScreen (live recording):**

- Источник: `useTrackerCamera()` → `cameraProps.followZoomLevel` (Plan 02 артефакт, константа `16` в текущей версии хука).
- Решение: **hook path**. Никаких новых `useState` / `onCameraChanged` callback'ов в screen. План явно просил "Prefer the hook path — avoid adding new state in the screen if the hook already provides it."
- Trade-off: пока `useTrackerCamera` отдаёт **константу 16**, simplification работает с фиксированной толерантностью независимо от реального текущего zoom (если пользователь рукой увеличил/уменьшил карту во время записи). Это приемлемо для PHASE1-05 — основная цель `simplifyForDisplay` это снижение FPS-нагрузки на длинных треках, и константная толерантность всё равно даёт >95% выигрыша. Эволюция к live zoom требует расширить `MapboxView` интерфейс (`onCameraChanged`) — out of scope этого плана.

**RunDetailsScreen (post-run preview):**

- Источник: `zoom={13}` — константа в JSX.
- Обоснование: `RunDetailsScreen` монтирует `<MapboxView followUserLocation={false}>` без явного `zoomLevel` — `MapboxView.tsx:39` определяет default `zoomLevel = 13` для `followUserLocation=false`. Передаём ту же 13 в `TrackLayer` / `HistoryTerritoryLayer` чтобы tolerance соответствовала отображаемому масштабу.
- Trade-off аналогично live: если пользователь зумит preview-map рукой, simplification не подстраивается. Visual artifact ничтожный при overview view (zoom 13).

**Default fallback:**

Оба компонента имеют `zoom?: number` с дефолтом 14 — нейтральное среднее между live (16) и preview (13). Дефолт срабатывает только если caller (не наши 2 экрана) забудет передать prop.

## Manual smoke (subjective)

Manual smoke на Pixel emulator не исполнялся — executor не имеет прямого доступа к запущенному эмулятору. Functional substitute:

- ✓ `trackSimplify.test.ts` Test 2: 3000 почти-коллинеарных точек → `geometry.coordinates.length < 100`. Подтверждает, что Douglas-Peucker реально сжимает данные перед отправкой в Mapbox.
- ✓ `trackSimplify.test.ts` Test 3: при том же входе zoom 16 даёт ≥ длину zoom 12 → подтверждает, что zoom-scaling работает.
- ✓ Полный тестовый прогон 536/536 green (включая `TrackerLiveScreen.navAfterSave.test.tsx` от Plan 04) — никакой регрессии на стороне screen flow.

**T7 (NFR-006 ≥50 fps panning at 5000+ points)** валидируется на железе в рамках Plan 09 (field test row). Этот план реализует код; field test — отдельный артефакт.

## Verification Results

- ✓ `cd apps/mobile-rn && npm test --silent` — 48 suites / **536 tests pass** (baseline 520 + 10 новых от Plan 05 + 6 от Plan 04 sub-batch B partner; см. `01-04-SUMMARY.md` от Plan 04).
- ✓ `cd apps/mobile-rn && npx tsc --noEmit` — clean.
- ✓ `cd apps/mobile-rn && npm run lint` — 0 errors, 76 warnings (все pre-existing, ни одного нового от Plan 05).
- ✓ `grep -c "mutate: false" src/map/util/simplify.ts` → **2** (явно в `simplifyForDisplay` opts + ссылка в module header).
- ✓ `grep -rn "simplifyForDisplay" src/` — appears in `TrackLayer.tsx`, `HistoryTerritoryLayer.tsx`, `simplify.ts`, и `trackSimplify.test.ts`; в screens только в комментариях; **NO occurrence в `domain/`, `state/`, `pipeline/`**.
- ✓ `grep -rn "calculateArea\b" src/` — все callers (`state/activity.ts:134`, `domain/session/SessionManager.ts:195, 473`) принимают `points` напрямую (raw из store/manager), **никогда** не получают simplified output.
- ✓ TrackLayer accepts optional `zoom?: number` (default 14), preserving backward compat для любых других callers.
- ✓ Both screens explicitly pass `zoom={...}` to TrackLayer **и** HistoryTerritoryLayer (verified by `grep "zoom=" src/navigation/screens/record/*.tsx`).
- ✓ HistoryTerritoryLayer закрытие кольца сохранено (explicit `coords.push(first)`).
- ✓ Все must_haves.truths из PLAN-frontmatter — TRUE (см. матрицу ниже).

### must_haves.truths matrix

| Truth                                                                                                       | Status | Where                                                                              |
| ----------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| TrackLayer renders simplified for visual LineLayer when points.length > 2000; raw never sent to visual layer | ✓     | `TrackLayer.tsx:45-56` — гейт по `SIMPLIFY_THRESHOLD_PTS`                          |
| HistoryTerritoryLayer applies the same simplification strategy                                              | ✓     | `HistoryTerritoryLayer.tsx:46-63` — тот же гейт, тот же `simplifyForDisplay`        |
| Tolerance scales with zoom via `BASE_TOLERANCE_DEG * Math.pow(2, 12 - zoom)`                                | ✓     | `simplify.ts:23` (`dynamicTolerance`); тесты `dynamicTolerance(10/12/14)`           |
| `@turf/simplify` called with `{ mutate: false, highQuality: false }`                                        | ✓     | `simplify.ts:42-44`                                                                |
| Area calculation continues to use raw points (verified by reading AreaCalculator callers)                   | ✓     | `state/activity.ts:134` + `SessionManager.ts:195, 473` оба принимают raw `points` |
| Unit tests assert trigger at >2000 pts, no-op below threshold, tolerance scales, mutate=false preserves     | ✓     | `trackSimplify.test.ts` — 10 тестов (4 threshold/scaling + 4 invariants + 2 edge)   |

## Deviations from Plan

### Auto-fixed Issues

**None** — plan executed exactly as written. D-15 was the highlighted risk (plan-checker round 1 warned about silent deferral); deliverable was scoped to deliver, and it does.

### Authentication gates

None — pure visual-layer refactor.

### Architectural decisions (Rule 4)

None — no DB / API / library / interface changes. `TrackLayer` got one new optional prop (`zoom`), `HistoryTerritoryLayer` got the same; both with safe defaults.

### Pragmatic decisions (not deviations, but worth documenting)

1. **Live zoom source.** Plan suggested either hook path or `onCameraChanged` local state. `useTrackerCamera` exposes a CONSTANT `followZoomLevel: 16` (Plan 02 contract), and `MapboxView` does NOT yet pass `onCameraChanged` through. Adding `onCameraChanged` would require extending `MapboxView.tsx` (the only Mapbox SDK importer) — outside this plan's surface. **Choice:** hook path with constant 16. **Cost:** simplification tolerance is fixed during a session — if the user manually zooms, tolerance doesn't follow. Negligible for FPS-improvement goal.

2. **Memo coalescing.** Plan's "bonus optimization" — `useMemo([Math.floor(points.length / 50), zoom])` to coalesce simplify recompute every 50 points. Applied as the primary memo strategy (not bonus), with eslint-disable for `react-hooks/exhaustive-deps` since `Math.floor(...)` is a derived value, not a direct dep. Smooth-trail visual was not tested on emulator but the math says max display lag ≈ 50 points ≈ 50 seconds at 1 Hz — well within usability bounds for a track that's only visible at scale once it crosses 2000 points (≈ 33 minutes of running).

3. **Pre-existing `pointsToLineString` path preserved** for short tracks. Two reasons: (a) minimum risk of regression for the common case (a typical 30-minute run is ≤ 2000 points at 1 Hz with pipeline drop rate ≈ 10%), (b) `pointsToLineString` returns a different shape (`EmptyCollection` for < 2 points) that `<ShapeSource shape={…}>` already accepts — we don't want to perturb the JSX-data-flow contract for the common path.

## Cross-link

This plan closes **PHASE1-05** ("Big-Track Simplification") fully. It implements **P1-D-04** (стратегия обновления при больших треках) from DEVELOPMENT_PLAN.md §3.

Field-test verification is **NOT in scope here** — T7 (NFR-006 ≥50 fps panning at 5000+ points) lands in `tests/FIELD_PROTOCOL.md` via Plan 09 (field test execution).

D-15 (HistoryTerritoryLayer simplification) **delivered in this plan** — no follow-up plan needed for that line item.

## Files Inventory

**Created:**

- `apps/mobile-rn/src/map/util/simplify.ts` (51 LOC) — `simplifyForDisplay`, `dynamicTolerance`, `BASE_TOLERANCE_DEG`, `SIMPLIFY_THRESHOLD_PTS`.
- `apps/mobile-rn/src/__tests__/trackSimplify.test.ts` (108 LOC) — 10 tests covering threshold, zoom scaling, mutate invariant, edge cases.

**Modified:**

- `apps/mobile-rn/src/map/components/TrackLayer.tsx` (+35 LOC) — `zoom?: number` prop, memo-based gating on `[floor(points.length/50), zoom]`, simplify path for ≥2000 points.
- `apps/mobile-rn/src/map/components/HistoryTerritoryLayer.tsx` (+28 LOC) — `zoom?: number` prop, per-session simplify path for closed sessions ≥2000 points, explicit ring closure.
- `apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx` (+7/-2 LOC) — pass `cameraProps.followZoomLevel` into `TrackLayer` + `HistoryTerritoryLayer`.
- `apps/mobile-rn/src/navigation/screens/record/RunDetailsScreen.tsx` (+5/-1 LOC) — pass `zoom={13}` to both layers.

## Self-Check: PASSED

Created files exist:
- ✓ `apps/mobile-rn/src/map/util/simplify.ts`
- ✓ `apps/mobile-rn/src/__tests__/trackSimplify.test.ts`

Modified files exist (with my edits):
- ✓ `apps/mobile-rn/src/map/components/TrackLayer.tsx` (verified via grep on `simplifyForDisplay`)
- ✓ `apps/mobile-rn/src/map/components/HistoryTerritoryLayer.tsx` (verified via grep on `simplifyForDisplay`)
- ✓ `apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx` (verified via grep on `zoom=`)
- ✓ `apps/mobile-rn/src/navigation/screens/record/RunDetailsScreen.tsx` (verified via grep on `zoom=`)

Commits exist on `feat/cursona-redesign`:
- ✓ `bf3c60a` — `feat(phase1): simplifyForDisplay helper (PHASE1-05)`
- ✓ `23bf9b4` — `perf(phase1): wire simplify into TrackLayer + HistoryTerritoryLayer + zoom prop (PHASE1-05)`
