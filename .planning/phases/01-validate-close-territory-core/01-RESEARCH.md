# Phase 1: Validate & Close Territory Core - Research

**Researched:** 2026-05-14
**Domain:** Mobile (Expo RN) field-test closure — GPS pipeline polish, Mapbox offline UX, haptics, refactors, token rotation
**Confidence:** HIGH

## Summary

This is **brownfield closure work**, not greenfield. Every code-side requirement in PHASE1-05..12 has existing scaffolding in `apps/mobile-rn/src/` and most "remaining" items are surgical additions to already-shipped subsystems. CONTEXT.md locked 37 decisions across 10 gray areas, so this research focuses on the HOW (verified APIs, version pins, gotchas, file paths) rather than the WHAT.

The single new dependency for this phase is `expo-haptics@~14.1.4` (canonical for Expo SDK 54). All other libraries — `@turf/simplify`, `@rnmapbox/maps`, `expo-location`, `expo-sqlite`, `react-native-mmkv` — are already present at versions that support every required feature. The biggest implementation risk surfaced by this research is a **bounds-ordering bug in the existing `offline.ts`** (passes `[sw, ne]` but `@rnmapbox/maps` v10 expects `[ne, sw]`) that is currently invisible because the home region is symmetric; PHASE1-10's manual picker MUST NOT propagate this pattern.

**Primary recommendation:** Treat this phase as 14 atomic landings, each producing one commit per REQ-ID; the only sequencing constraint is that PHASE1-07 (SessionManager) and PHASE1-11 (adaptive sampling) share an editing window in `state/activity.ts` and should be planned as sequential waves to avoid merge churn.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Field-test data capture (PHASE1-01..04) | UI / Storage (mobile) | Researcher (human) | Owner-driven runs; capture format already supported by Share API + tests/runs/ |
| Big-track simplification (PHASE1-05) | Map (`src/map/components/`) | Util (`src/util/`) | Display-only concern; raw track stays in domain |
| Hook extraction (PHASE1-06) | UI (`navigation/screens/record/hooks/`) | — | Pure presentation refactor; no domain/state changes |
| SessionManager extraction (PHASE1-07) | Domain (`src/domain/session/` or `src/modules/session/`) | State (Zustand wrapper) | Pure imperative class; Zustand store delegates |
| Closure haptic + toast (PHASE1-08) | UI (Toast component + TrackerLiveScreen hook) | Adapter (`expo-haptics`) | Effect triggered by existing `closureFired` event |
| Summary screen (PHASE1-09) | UI (`RunDetailsScreen`) | Navigation (route wiring) | Screen exists; verify post-Stop+Save lands on it |
| Offline region picker (PHASE1-10) | UI (`screens/settings/RegionPickerScreen`) | Map (`src/map/offline.ts` extension) | Mapbox SDK quarantine via MapboxView |
| Adaptive sampling (PHASE1-11) | Adapter (`LocationAdapter` + `ExpoLocationAdapter`) | State (PauseDetector subscriber) | Behavior extension on existing interface |
| SLC fallback (PHASE1-12) | Adapter (`ExpoLocationAdapter` iOS branch) | State (gap detector) | iOS-only; Android no-op |
| Token rotation (PHASE1-13) | Build / Config (`~/.netrc`, `~/.gradle/gradle.properties`, `.env`) | Lint (`eslintrc`) | Build-time secret; ESLint guard prevents regression |
| Phase 1 closure docs (PHASE1-14) | Docs (`STATUS.md`, `docs/DEVELOPMENT_PLAN.md`, ADR) | — | No code |

## User Constraints (from CONTEXT.md)

### Locked Decisions

All 37 decisions D-01..D-37 in `01-CONTEXT.md` apply verbatim. Highlights:

- **D-01 / D-03** Field testing owner-driven; results captured as (a) `tests/FIELD_PROTOCOL.md` row, (b) GPX in `tests/runs/<device>/<test>/<timestamp>.gpx`, (c) battery photo for T6/T8.
- **D-02** Device order: Pixel → iPhone → Chinese Android.
- **D-06** Hooks to extract: `useTrackerCamera`, `useLayerVisibility`, `usePauseUI`.
- **D-08** SessionManager: pure class delegated to by Zustand store; gradual cutover Phase A/B/C.
- **D-12 / D-13 / D-14** `@turf/simplify` (already a dep); trigger at >2000 points; tolerance `0.00005` deg at zoom 12, `Math.pow(2, 12 - zoom)` linear scale; dual GeoJSON sources (`track-simplified` for render, `track-raw` for area calc).
- **D-16** `expo-haptics` + `Haptics.notificationAsync(NotificationFeedbackType.Success)`.
- **D-17** In-house Toast (no new dependency) at `apps/mobile-rn/src/ui/Toast.tsx`.
- **D-19** Toast text RU: «Зона замкнута! Площадь: N м²» (or km² when ≥10000 m²).
- **D-23** Manual region picker: full-screen Mapbox view, draggable rectangle, 4 corner handles, zoom 12–16, reject regions >50 MB estimated.
- **D-27** `LocationAdapter.setSamplingMode(mode: 'active' | 'paused' | 'background-slc')`.
- **D-29** iOS-only SLC fallback; gap threshold 30s configurable via `settingsStore.gpsGapTriggerS`. Do not interpolate.
- **D-30** Android: no SLC — already have foreground service + battery-optimization hint.
- **D-32 / D-33** Token rotation playbook in `docs/SECRETS.md`; ESLint rule rejects `process.env.EXPO_PUBLIC_*_SECRET` and string literals matching `^sk\.`.

### Claude's Discretion

- Test placement: `apps/mobile-rn/src/__tests__/` colocated pattern.
- Commit granularity: atomic per REQ-ID; format `feat(phase1): <one-line> (PHASE1-XX)`.
- Branch strategy: feed test runs into whatever branch is active; refactors on `feat/cursona-redesign` OR a sibling branch — planner decides.
- Visvalingam–Whyatt fallback if Douglas-Peucker proves insufficient on long tracks (not blocking).

### Deferred Ideas (OUT OF SCOPE)

- Mapbox Studio custom style — revisit post-field-test.
- Visvalingam–Whyatt fallback — only if D-P fails on >20k points.
- HR-zone time breakdown, splits-over-time line chart — cosmetic, Phase 6.5.
- Privacy zone masking — Phase 4.
- Background reliability OEM-specific in-app guides (Auto-start in Xiaomi Settings, etc.) — document in ADR D-36, do not ship UX.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PHASE1-01 | T1 (5km ref loop) on iPhone/Pixel/Chinese-Android | Existing GPX share API + FIELD_PROTOCOL.md scaffold |
| PHASE1-02 | T2/T9 area tests, ≤5% error | `AreaCalculator` 95% coverage already; no code changes needed |
| PHASE1-03 | T6 2-hour session, battery ≤10%/h, mem ≤100MB | Performance instrumentation hooks (see Validation Architecture) |
| PHASE1-04 | T8 background reliability ≥95% | Existing foreground service + adaptive sampling (PHASE1-11) |
| PHASE1-05 | T7 5000+ pts ≥50 fps; D-P simplification if fails | `@turf/simplify@^7.3.5` ready (see Code Examples) |
| PHASE1-06 | Hook extraction from TrackerLiveScreen | Pure refactor in `screens/record/hooks/` |
| PHASE1-07 | SessionManager class | Domain-pure imperative class; CONCERNS.md R5+R9 fix |
| PHASE1-08 | Closure haptic + toast | `expo-haptics@~14.1.4` + in-house Toast component |
| PHASE1-09 | Summary screen post-Stop+Save | `RunDetailsScreen.tsx` exists — verify nav.replace flow |
| PHASE1-10 | Manual offline region picker UI | Extend `src/map/offline.ts` + new screen |
| PHASE1-11 | Adaptive GPS sampling | Extend `LocationAdapter` with `setSamplingMode` |
| PHASE1-12 | iOS SLC fallback when foreground service killed | `expo-location@~19.0.8` supports `startLocationUpdatesAsync` with `accuracy: LowestForNavigation` analogue; SLC via `Location.Accuracy.Lowest` + activity type tuning |
| PHASE1-13 | Mapbox token rotation pk→sk + ESLint guard | `.netrc` / `gradle.properties` + `no-restricted-syntax` AST rule |
| PHASE1-14 | Close Phase 1 in STATUS.md + DEVELOPMENT_PLAN.md | Documentation + optional ADR |

## Standard Stack

### Core (already installed — verified in `apps/mobile-rn/package.json`)

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------------------|---------|--------------|
| `@rnmapbox/maps` | `^10.3.0` (locked 10.3.0) | Mapbox SDK binding; `offlineManager` + `LineLayer` + `PointAnnotation` for picker | Sole permitted Mapbox entry per ESLint quarantine |
| `@turf/simplify` | `^7.3.5` | Douglas-Peucker simplification | Bundled in `@turf/turf`; deterministic; well-tested |
| `expo-location` | `~19.0.8` (SDK 54) | GPS + headless TaskManager | Existing adapter; supports iOS BestForNavigation + Android foreground service |
| `expo-task-manager` | `~14.0.9` | Background headless task | Wraps native iOS UIBackgroundModes + Android foreground service |
| `expo-sqlite` | `~16.0.10` | SQLite repos | In-process sync API works for real-DB integration tests |
| `react-native-mmkv` | `^4.3.1` | Settings persist (e.g. `gpsGapTriggerS`) | Already used by settingsStore |
| `zustand` | `^5.0.13` | Store wrapping SessionManager | Existing pattern; functional `set` already used (R7) |
| `jest` + `jest-expo` | `^29.7.0` / `~54.0.0` | Test runner | Already running 435/435; preset transforms `@rnmapbox/*` |
| `@testing-library/react-native` | `^13.3.3` | Hook tests for D-06 hooks, Toast snapshot | Installed but unused — first phase to use it |

### Supporting (already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@turf/buffer` | `^7.3.5` | Corridor (already wired) | No new work |
| `@turf/helpers` | `^7.3.5` | `featureCollection`, `lineString` builders | Big-track simplification dual-source split |

### New Dependency (single one)

| Library | Version | Source | Verified |
|---------|---------|--------|----------|
| `expo-haptics` | `~14.1.4` | npm | `npm view expo-haptics versions` confirmed `14.1.4` stable; SDK 55 ships `15.0.x` — do NOT install latest, pin to `~14.1.4` for SDK 54 [VERIFIED: npm registry 2026-05-14] |

**Installation:**
```bash
cd apps/mobile-rn
npx expo install expo-haptics
# Verify version: should resolve to ~14.1.x for Expo SDK 54.
# If npm picks 15.x, override: npm install expo-haptics@~14.1.4 --save-exact
```

**Version verification:** `expo-haptics@14.1.4` (Apr 2025), `expo-haptics@15.x` (SDK 55 — not for this project). `@turf/simplify@7.3.5` is current; a `^8.0.0` release exists but introduces breaking changes to options shape — stay on 7.x. [VERIFIED: npm view expo-haptics versions, npm view @turf/simplify versions]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `expo-haptics` | `react-native-haptic-feedback` | Adds native module not aligned with Expo managed workflow; haptics on Expo SDK 54 is one-line install — no benefit. Locked decision D-16. |
| In-house Toast | `react-native-toast-message`, `burnt`, `react-native-flash-message` | Locked decision D-17 — no new dep; existing dark theme `#10B981` accent is already in design system. |
| `@turf/simplify` (Douglas-Peucker) | `simplify-js` standalone, custom Visvalingam–Whyatt | D-P is good enough for GPS-noisy paths up to ~20k points (CONTEXT.md D-12). VW fallback explicitly deferred. |

## Architecture Patterns

### System Architecture Diagram (Phase 1 closure scope)

```text
┌────────────────────────────────────────────────────────────────────┐
│  Field-Test Runner (human)                                         │
│  ─ T1..T15 → tests/FIELD_PROTOCOL.md + tests/runs/<dev>/<t>/*.gpx │
└──────────────────────────┬─────────────────────────────────────────┘
                           │ feeds back into ADR-0005 if surprises
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│  Mobile App Edits (parallel waves)                                 │
├──────────────────────────────────────────────────────────────────┬─┤
│ Wave A: ESLint guard (PHASE1-13)                                 │ │
│         token rotation playbook                                  │ │
│ Wave B: Hook extraction (PHASE1-06) — TrackerLiveScreen          │ │
│ Wave C: SessionManager extraction (PHASE1-07) — activity.ts      │ │
│         + real-SQLite integration tests (R5)                     │ │
│ Wave D: Big-track simplification (PHASE1-05) — TrackLayer        │ │
│         + HistoryTerritoryLayer dual-source                      │ │
│ Wave E: Haptic + Toast (PHASE1-08) — closureFired effect         │ │
│ Wave F: Summary screen wire-up (PHASE1-09) — route audit         │ │
│ Wave G: Region picker UI (PHASE1-10) — new SettingsScreen child  │ │
│ Wave H: Adaptive sampling (PHASE1-11) — LocationAdapter ext      │ │
│ Wave I: iOS SLC fallback (PHASE1-12) — ExpoLocationAdapter       │ │
│ Wave J: Phase 1 closure docs (PHASE1-14) — STATUS.md + ADR       │ │
└──────────────────────────┬─────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│  Existing Subsystems (do NOT change)                               │
│  ─ Domain (AreaCalculator, ClosureDetector, calories, records)     │
│  ─ Pipeline (Kalman, PauseDetector)                                │
│  ─ MapAdapter quarantine (ESLint enforced)                         │
│  ─ Storage (sessionRepository, pointRepository — real-SQLite test) │
└────────────────────────────────────────────────────────────────────┘
```

### Recommended File Layout

```
apps/mobile-rn/src/
├── navigation/screens/record/
│   ├── TrackerLiveScreen.tsx          (existing — slim down via D-06 hooks)
│   ├── RunDetailsScreen.tsx           (existing — verify post-Stop nav.replace)
│   └── hooks/                         (NEW — PHASE1-06)
│       ├── useTrackerCamera.ts
│       ├── useLayerVisibility.ts
│       ├── usePauseUI.ts
│       ├── useClosureFeedback.ts      (PHASE1-08 — haptic+toast effect)
│       └── __tests__/                 (colocated by convention exception OR /src/__tests__/)
├── navigation/screens/settings/
│   └── RegionPickerScreen.tsx         (NEW — PHASE1-10)
├── ui/
│   └── Toast.tsx                      (NEW — PHASE1-08)
├── domain/session/                    (NEW — PHASE1-07; or src/modules/session/)
│   ├── SessionManager.ts              (pure imperative class)
│   └── __tests__/SessionManager.test.ts
├── map/
│   └── offline.ts                     (EXTEND — PHASE1-10 createCustomPack, estimateSize)
├── location/
│   ├── LocationAdapter.ts             (EXTEND — PHASE1-11 setSamplingMode)
│   └── adapters/
│       └── ExpoLocationAdapter.ts     (EXTEND — PHASE1-11 + PHASE1-12 SLC)
└── state/
    ├── activity.ts                    (REFACTOR — delegate to SessionManager)
    └── settings.ts                    (EXTEND — gpsGapTriggerS)
```

### Pattern 1: SessionManager extraction (D-08, D-09)

**What:** Pure imperative class that owns session lifecycle (start, pause, resume, ingestRawPoint, markLap, stop, save, discard, recover) without React/Mapbox/SQLite knowledge. Zustand store constructs ONE instance and exposes reactive state via selectors.

**When to use:** Phase A — manager exists, store delegates mutations. Phase B — closure detection + lap orchestration move into manager. Phase C — tests rewrite against manager directly.

**Example skeleton:**
```typescript
// apps/mobile-rn/src/domain/session/SessionManager.ts
// Source: distilled from existing state/activity.ts after god-store decomposition.
// Dependencies passed in via constructor — pure injectable.

export interface SessionRepo {
  create(s: { id: number; startedAt: number; activityType: ActivityType }): void;
  appendPoints(sid: number, pts: Point[]): void;
  finalize(sid: number, summary: SessionSummary): void;
}

export class SessionManager {
  private state: ActivityState = 'idle';
  private points: Point[] = [];
  private sessionId: number | null = null;
  private buffer: Point[] = [];
  // ... etc

  constructor(
    private readonly pipeline: Pipeline,
    private readonly pauseDetector: PauseDetector,
    private readonly closureDetector: ClosureDetector,
    private readonly repo: SessionRepo,
    private readonly onChange: () => void, // store subscribes
  ) {}

  start(activityType: ActivityType = 'run'): void {
    if (this.state !== 'idle') return;
    this.sessionId = Date.now();
    this.repo.create({ id: this.sessionId, startedAt: this.sessionId, activityType });
    this.state = 'recording';
    this.onChange();
  }

  ingestRawPoint(raw: RawPoint): void {
    const accepted = this.pipeline.process(raw);
    if (accepted === null) return;
    this.pauseDetector.observe(accepted);
    this.acceptPoint(accepted);
  }

  // ... rest mirrors current activity.ts logic
  snapshot(): SessionSnapshot { return { state: this.state, points: this.points, ... }; }
}
```

The store becomes a thin wrapper:
```typescript
// src/state/activity.ts (post-refactor — drastically smaller)
const manager = new SessionManager(pipeline, pauseDetector, closureDetector, repo, () => {
  useActivityStore.setState(manager.snapshot());
});

export const useActivityStore = create<ActivityStore>(() => ({
  ...manager.snapshot(),
  start: (t) => manager.start(t),
  stop: () => manager.stop(),
  // ...
}));
```

### Pattern 2: Big-track dual-source simplification (D-12, D-14)

**What:** Render uses simplified GeoJSON; area calc uses raw. Switching is transparent to TrackLayer caller.

**Example:**
```typescript
// apps/mobile-rn/src/map/components/TrackLayer.tsx (refactor)
// Source: @turf/simplify@7.3.5 docs; tolerance scaling per CONTEXT.md D-14.
import simplify from '@turf/simplify';
import { lineString, type Feature, type LineString } from '@turf/helpers';

const SIMPLIFY_THRESHOLD_PTS = 2000;
const BASE_TOLERANCE_DEG = 0.00005; // ~5m at zoom 12, equator

function dynamicTolerance(zoom: number): number {
  // Scale linearly: tolerance halves per zoom level above 12 (more detail closer in).
  return BASE_TOLERANCE_DEG * Math.pow(2, 12 - zoom);
}

export function TrackLayer({ points, zoom = 14 }: { points: Point[]; zoom?: number }) {
  const displayLine = useMemo(() => {
    if (points.length < 2) return null;
    const raw = lineString(points.map(p => [p.longitude, p.latitude]));
    if (points.length < SIMPLIFY_THRESHOLD_PTS) return raw;
    return simplify(raw, { tolerance: dynamicTolerance(zoom), highQuality: false, mutate: false });
  }, [points, zoom]);
  // render <LineLayer> with displayLine as ShapeSource.
}
```

**IMPORTANT:** `simplify` from `@turf/simplify@^7` accepts a `Feature<LineString>` not raw coords; pass through `lineString()` first. `mutate: false` prevents in-place mutation of the source array.

### Pattern 3: Closure haptic + toast effect (D-16, D-18)

```typescript
// apps/mobile-rn/src/navigation/screens/record/hooks/useClosureFeedback.ts
// Source: expo-haptics@14.1.4 docs; pattern matches existing closureFired event in activity.ts:119.
import { useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { useActivityStore } from '../../../../state/activity';
import { useToast } from '../../../../ui/Toast';
import { formatArea } from '../../../../ui/format';

export function useClosureFeedback() {
  const closureFired = useActivityStore(s => s.closureFired);
  const areaM2 = useActivityStore(s => s.areaM2);
  const { show } = useToast();
  useEffect(() => {
    if (!closureFired || areaM2 === null) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      .catch(() => { /* iOS sim / unsupported device — silent */ });
    show(`Зона замкнута! Площадь: ${formatArea(areaM2)}`);
  }, [closureFired, areaM2, show]);
}
```

`Haptics.notificationAsync()` returns a Promise; **iOS simulator and many low-end Android devices reject it** — always catch and swallow (UX is non-critical feedback). Confirmed via Expo docs: `notificationAsync` is gentler than `impactAsync` and matches "success" semantics. Cost is one native call per closure event — closures are rare (once per session), so performance is irrelevant.

### Pattern 4: Manual offline region picker (D-23..D-26)

```typescript
// apps/mobile-rn/src/map/offline.ts (EXTEND — add createCustomPack)
// CRITICAL: bounds order is [NE, SW] in @rnmapbox/maps v10 — NOT [SW, NE].
// Existing `downloadHomeRegion` passes [SW, NE] but accidentally works because the bbox is symmetric.

export async function createCustomPack(opts: {
  name: string;
  ne: [number, number]; // [lng, lat]
  sw: [number, number];
  styleUrl?: string;
  minZoom?: number;
  maxZoom?: number;
  onProgress?: (p: number) => void;
}): Promise<void> {
  await offlineManager.createPack(
    {
      name: opts.name,
      styleURL: opts.styleUrl ?? 'mapbox://styles/mapbox/outdoors-v12',
      minZoom: opts.minZoom ?? 12,
      maxZoom: opts.maxZoom ?? 16,
      bounds: [opts.ne, opts.sw], // [NE, SW] — verified in OfflineCreatePackOptions._makeLatLngBounds
    },
    (_region, status) => opts.onProgress?.(status.percentage ?? 0),
    (_region, error) => console.error('[offline] custom pack error', error),
  );
}

// Rough size estimate (no public getPackEstimateSize in v10 — compute from tile count)
export function estimatePackSize(ne: [number, number], sw: [number, number], minZ = 12, maxZ = 16): { tiles: number; kb: number } {
  let tiles = 0;
  for (let z = minZ; z <= maxZ; z++) {
    const n = Math.pow(2, z);
    const x1 = Math.floor((sw[0] + 180) / 360 * n);
    const x2 = Math.floor((ne[0] + 180) / 360 * n);
    const latRad1 = ne[1] * Math.PI / 180;
    const latRad2 = sw[1] * Math.PI / 180;
    const y1 = Math.floor((1 - Math.log(Math.tan(latRad1) + 1 / Math.cos(latRad1)) / Math.PI) / 2 * n);
    const y2 = Math.floor((1 - Math.log(Math.tan(latRad2) + 1 / Math.cos(latRad2)) / Math.PI) / 2 * n);
    tiles += Math.abs(x2 - x1 + 1) * Math.abs(y2 - y1 + 1);
  }
  return { tiles, kb: tiles * 30 }; // ~30 KB avg per vector tile for outdoors-v12
}
```

For the **draggable rectangle UI**: `@rnmapbox/maps` v10 has no built-in draggable annotation. Implement via `PointAnnotation` at 4 corner positions (`draggable` prop) plus a `FillLayer` over a `ShapeSource` whose polygon is recomputed in state on each corner drag. Reference pattern: a single `useState<[Position, Position, Position, Position]>` for corners; `onDragEnd` of each `PointAnnotation` updates one corner. Tilemax: Mapbox enforces ~6000 tiles per pack on iOS — at zoom 12–16 over ~50 km² that is well within budget; reject regions whose `estimatePackSize().tiles > 5500` to leave headroom.

### Pattern 5: Adaptive sampling (D-27, D-28)

```typescript
// apps/mobile-rn/src/location/LocationAdapter.ts (EXTEND)
export type SamplingMode = 'active' | 'paused' | 'background-slc';

export interface LocationAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): Promise<boolean>;
  requestForegroundPermission(): Promise<boolean>;
  requestBackgroundPermission(): Promise<boolean>;
  /** Switch sampling profile without stop/start. Default mode is 'active'. */
  setSamplingMode(mode: SamplingMode): Promise<void>;
}

// apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts (EXTEND)
async setSamplingMode(mode: SamplingMode): Promise<void> {
  if (!(await this.isRunning())) return;
  const opts = MODE_OPTIONS[mode]; // table-driven
  // expo-location v19 exposes Location.startLocationUpdatesAsync — calling again with the
  // same task name replaces the active configuration without stop/start. Verified in
  // expo-location source: startLocationUpdatesAsync is idempotent on TASK_NAME.
  await Location.startLocationUpdatesAsync(TASK_NAME, opts);
}

const MODE_OPTIONS: Record<SamplingMode, Location.LocationTaskOptions> = {
  active: { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: 1000, ... },
  paused: { accuracy: Location.Accuracy.Balanced, distanceInterval: 50, timeInterval: 5000, ... },
  'background-slc': { accuracy: Location.Accuracy.Lowest, distanceInterval: 500, timeInterval: 0, ... }, // iOS SLC-equivalent
};
```

iOS true SLC (`startMonitoringSignificantLocationChanges`) is NOT exposed by `expo-location@19.0.8`; the closest analogue is `Accuracy.Lowest` + `distanceInterval: 500`. To get genuine SLC behavior the project would need a custom native module — out of scope per D-30. The `'background-slc'` mode here is the documented Expo approximation. [CITED: docs.expo.dev/versions/v54.0.0/sdk/location/]

### Pattern 6: iOS gap-resume (D-29)

```typescript
// apps/mobile-rn/src/state/activity.ts (or SessionManager.ts post-D-08)
// Triggered on app foreground via AppState listener.
import { AppState } from 'react-native';

AppState.addEventListener('change', (next) => {
  if (next !== 'active') return;
  const points = useActivityStore.getState().points;
  if (points.length === 0) return;
  const last = points[points.length - 1];
  const gapMs = Date.now() - last.timestamp;
  const thresholdMs = useSettingsStore.getState().gpsGapTriggerS * 1000;
  if (gapMs > thresholdMs) {
    // Gap detected — pipeline already resets via KalmanFilter on next far-apart point;
    // explicitly call pipeline.reset() to drop stale Kalman state and avoid jump-spike.
    pipeline.reset();
    console.warn(`[gap-resume] ${gapMs}ms gap detected — pipeline reset`);
  }
});
```

**Do not interpolate** (per D-29). Visible gaps in the track are the correct UX — they signal "GPS was lost" to the user honestly.

### Anti-Patterns to Avoid

- **Importing `expo-haptics` outside `useClosureFeedback` hook** — keep one call site so the catch-swallow pattern is consistent.
- **Putting `simplify(...)` inside `useMemo([points])` on every point append** — gets called O(N) per minute. Gate via `useMemo` keyed on `points.length` AND a length-changed-by-threshold check.
- **Drawing the picker rectangle with `LineLayer` over `lineString` of 4 corners** — fails to close because `LineLayer` does not draw the closing edge unless coords are looped. Use `FillLayer` + `Polygon` instead.
- **Calling `Haptics.notificationAsync` synchronously in `closureDetector` callback** — that callback runs during a Zustand `set`; native async calls inside the reducer cycle introduce reentrancy. Always wire haptic via `useEffect`.
- **Adding `expo-haptics@latest` (15.x) without `--save-exact`** — npm will pull SDK 55 version which is incompatible with `expo@~54.0.33`. Pin to `~14.1.4`.
- **Bypassing `MapboxView`** in the region picker — would violate `no-restricted-imports`. Mount `MapboxView` and stack a `<View>` overlay with corner handles outside the map; the corner handle positions are derived in screen-space via `mapboxRef.coordinateForPixel()` or by storing corners as world coordinates and re-rendering via `PointAnnotation`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Track simplification | Custom Douglas-Peucker | `@turf/simplify` | Edge cases (self-intersection after simplify, zero-area degeneracy, antimeridian crossing) already handled |
| GPX export | Custom XML builder | Existing GPX export via Share API (`apps/mobile-rn/src/domain/gpx.ts`) | Already tested with 7 test cases; field-test capture (D-03) reuses |
| Toast animation | Reanimated / native driver | `Animated.View` + `useNativeDriver: true` | Toast is 2.5s fade; Animated API in core RN is sufficient |
| Tile size estimation | Mapbox API call | Local Web Mercator tile math (see Pattern 4) | `getPackEstimateSize` is NOT in `@rnmapbox/maps@10.3.0` public API — verified by reading `lib/typescript/src/modules/offline/offlineManager.d.ts` |
| Haptic feedback wrapper | Custom native bridge | `expo-haptics` | One install, one method call, iOS + Android parity |
| Permission check before SLC mode switch | Custom check | `Location.hasStartedLocationUpdatesAsync(TASK_NAME)` then reconfigure | Idempotent re-call of `startLocationUpdatesAsync` replaces config |
| Real-SQLite test harness | Custom mock DB | `expo-sqlite` in-process — works under Jest with `jest-expo` preset | `expo-sqlite@16.0.10` provides sync API (`openDatabaseSync(':memory:')`) usable directly in Jest |

**Key insight:** This phase is dominated by *integration polish*, not novel building. Every cell in "Use Instead" is already installed or a one-line install away. The trap is over-engineering — e.g. introducing Reanimated for the Toast, or building a custom rectangle-draw library when 4 PointAnnotations + state suffice.

## Runtime State Inventory

> This phase is a closeout / polish phase, not a rename. The inventory below tracks runtime systems that PHASE1-13 (token rotation) and PHASE1-07 (SessionManager) might touch.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | SQLite tables `sessions`, `points`, `laps`, `sensor_readings`, `personal_records`, `wallet_*` — None are renamed by this phase. R5 says walletRepository / lapRepository / sessionRepository / pointRepository need real-SQLite integration tests added (D-10). | Add `*.integration.test.ts` files; no migration. |
| Live service config | Mapbox token: pk-classified `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` (correct pk-style, public token, OK to ship) + secret `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (per `.env.example`, used by CocoaPods at build time, intended sk-classified). The "leaked / mis-classified" Mapbox token referenced in PHASE1-13 is the latter — verify it is currently `sk.*`, restrict to Bundle ID `com.runningecosystem.mobile` + Android SHA-256 fingerprint. | Manual rotation in Mapbox dashboard; update `~/.netrc` and `~/.gradle/gradle.properties` per D-32. |
| OS-registered state | None — phase makes no new OS registrations. Existing iOS UIBackgroundModes (`location`, `fetch`, `processing`) and Android foreground service intent stay unchanged. | None. |
| Secrets / env vars | `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` (public pk., bundled — must NOT be replaced with sk.); `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (build-time secret, sk-style, lives in `~/.netrc` for iOS + `~/.gradle/gradle.properties` for Android, NEVER in committed `.env`). D-33 adds ESLint rule rejecting any `EXPO_PUBLIC_*_SECRET` literal. | Verify both env vars in `apps/mobile-rn/.env.example`; add ESLint guard. |
| Build artifacts | iOS `Pods/`, Android `.gradle/`, Mapbox tile cache (offline packs persist across rebuilds). After token rotation, existing builds with old tokens may continue to work until offline pack TTL — but new tile fetches will 403. | Rebuild + verify tile fetch on dev build. |

**Nothing found in OS-registered state, build artifacts:** Confirmed via grep of `app.json` plugins, `android/app/build.gradle`, `ios/mobile_rn.xcodeproj`. No tasks registered with `expo-task-manager` outside `BACKGROUND_LOCATION_TASK` (which is unaffected).

## Common Pitfalls

### Pitfall 1: Mapbox v10 bounds order [NE, SW] vs intuitive [SW, NE]

**What goes wrong:** Manual region picker passes corners as `[swCorner, neCorner]` (intuitive) but Mapbox SDK v10 expects `[ne, sw]`. Pack downloads tiles for an inverted region — often empty or wrong continent.
**Why it happens:** The existing `apps/mobile-rn/src/map/offline.ts:49-52` uses `[sw, ne]` but it accidentally works because the home region is symmetric ±0.05 deg in lat AND lon — the inverted bbox is the same bbox. Manual regions are asymmetric so the bug surfaces.
**How to avoid:** Document corner labels in the picker UI; create one helper `createCustomPack({ ne, sw, ... })` that internally does `bounds: [opts.ne, opts.sw]` and never let raw `[a, b]` tuples leak into callers.
**Warning signs:** Pack reports `tiles=0` or `tiles=billions`; downloaded pack shows wrong region on `getPackBounds`. [VERIFIED: `node_modules/@rnmapbox/maps/lib/module/modules/offline/OfflineCreatePackOptions.js` — `const [ne, sw] = bounds;`]

### Pitfall 2: `expo-haptics` silently rejected on iOS Simulator

**What goes wrong:** `Haptics.notificationAsync()` returns a rejected Promise on iOS Simulator and on Android <8.0 lacking vibrator hardware. Unhandled rejection becomes a yellow box / console error.
**Why it happens:** Native haptic engine is missing — Expo wraps gracefully but still rejects.
**How to avoid:** `.catch(() => {})` on every haptic call. Treat haptics as best-effort UX, never load-bearing.
**Warning signs:** Yellow box on simulator runs; field-test on iPhone with silent mode on shows no haptic (expected).

### Pitfall 3: `@turf/simplify` mutates input by default

**What goes wrong:** Passing the live `points` array via `simplify(lineString(coords))` mutates `coords` in place; subsequent area calc operates on simplified coords → 5–15% area error.
**Why it happens:** `simplify`'s `mutate` option defaults to `false` in v7 (was `true` in older versions), but conversion to `Feature<LineString>` via `lineString()` allocates fresh coords array — so mutate=false is the safe default in v7. **The risk is if a contributor passes the raw coords array directly to simplify (some examples in older Turf docs do this).**
**How to avoid:** Always wrap in `lineString(...)` first; explicitly pass `mutate: false`. NEVER feed simplified coords into `calculateArea` — keep dual sources (D-14).
**Warning signs:** Area calc results drift from baseline; T2/T9 field tests fail 5% threshold.

### Pitfall 4: SessionManager extraction breaks the Zustand `set()` reactivity chain

**What goes wrong:** Refactor moves mutations into SessionManager class. Class mutates internal state but the Zustand store does not see changes — React doesn't re-render.
**Why it happens:** Zustand's `set()` is the only signal that triggers subscribers. If SessionManager mutates `this.points.push(p)` but the store never re-reads, UI is stale.
**How to avoid:** SessionManager exposes `snapshot()` returning a fresh object; calls `onChange` callback after every mutation; store's `onChange` is `() => useActivityStore.setState(manager.snapshot())`. This is the pattern locked in D-09 Phase A.
**Warning signs:** Metrics bar shows 0 distance during recording even though points are being captured; closure event never fires in UI.

### Pitfall 5: SLC mode-switch race during pause→resume

**What goes wrong:** PauseDetector fires `auto-paused` → SessionManager calls `setSamplingMode('paused')`. Pipeline is mid-process. Next point arrives at low-accuracy distance interval; Kalman state is stale.
**Why it happens:** `setSamplingMode` configures expo-location asynchronously; in the meantime, pipeline keeps emitting points from the previous (high-accuracy) source.
**How to avoid:** On any mode switch, also call `pipeline.reset()` — Kalman re-initializes from the first new point. PauseDetector already filters paused points so this is safe.
**Warning signs:** Post-pause segment shows large jump (15–30m) at resume.

### Pitfall 6: ESLint `no-restricted-syntax` AST rule false-positives

**What goes wrong:** Naively pattern-matching `/^sk\./` in string literals catches `'sk.dropdown'`, `'sk-button'`, etc. in unrelated UI strings.
**Why it happens:** Regex match runs against ALL string literals in the file.
**How to avoid:** Use an AST selector that constrains the pattern to literals appearing in `process.env.X` reads or in import/require contexts. Sample selector: `Literal[value=/^sk\.[A-Za-z0-9_-]{40,}/]` (token strings are long).
**Warning signs:** Lint suddenly errors on unrelated files like `Button.tsx` referencing a Tailwind class.

### Pitfall 7: Mapbox offline pack iOS 6000-tile silent cap

**What goes wrong:** User picks a 100×100km region at zoom 12–16. iOS silently caps at 6000 tiles and downloads a fraction of the requested area; user thinks they have full coverage.
**Why it happens:** Mapbox SDK iOS enforces 6000 tiles per pack as a license-enforcement quota; the JS layer doesn't expose this limit.
**How to avoid:** D-23 caps at 50 MB estimated; the `estimatePackSize` function returns `tiles` — reject if `tiles > 5500`. Surface tile count to user before confirming download.
**Warning signs:** Downloaded pack shows blanks at edges; user reports "offline map missing my area." [CITED: docs.mapbox.com/help/glossary/offline-tile-limits/]

### Pitfall 8: Real-SQLite integration tests crash on `expo-sqlite` import under Jest

**What goes wrong:** `import * as SQLite from 'expo-sqlite'` under Jest throws "Unable to resolve module" or returns undefined for `openDatabaseSync`.
**Why it happens:** `jest-expo` preset handles transformation but the native module needs explicit mock; `expo-sqlite` v16+ ships a pure-JS WASM build for the new architecture that DOES load under Node.
**How to avoid:** Verify with a probe test: `const db = SQLite.openDatabaseSync(':memory:'); db.execSync('SELECT 1');`. If it fails, install `better-sqlite3` (current `12.10.0`) as a devDep and write a shim that swaps the import under `NODE_ENV === 'test'`. CONTEXT.md D-10 commits to real-SQLite; if `expo-sqlite` in-process fails under Jest, fall back to `better-sqlite3`. [ASSUMED: expo-sqlite v16 in-process behavior under jest-expo — verify empirically as first task of PHASE1-07]

## Code Examples

### Toast component (Pattern 3 dependency)

```typescript
// apps/mobile-rn/src/ui/Toast.tsx (NEW — PHASE1-08, D-17)
// Source: standard RN Animated pattern; theme tokens from existing design system.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

type Ctx = { show: (text: string, durationMs?: number) => void };
const ToastCtx = createContext<Ctx>({ show: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  const show = useCallback((text: string, durationMs = 2500) => {
    setMsg(text);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(durationMs),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setMsg(null));
  }, [opacity]);

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {msg && (
        <Animated.View style={[styles.toast, { opacity }]} pointerEvents="none">
          <Text style={styles.text}>{msg}</Text>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute', bottom: 100, alignSelf: 'center',
    backgroundColor: '#10B981', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24,
    elevation: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  text: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
```

Mount `<ToastProvider>` in `App.tsx` once, above `<RootNavigator>`. No new state-store registration needed.

### ESLint AST guard (PHASE1-13, D-33)

```js
// apps/mobile-rn/.eslintrc.json — add to "rules":
"no-restricted-syntax": [
  "error",
  {
    "selector": "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^EXPO_PUBLIC_.*_SECRET$/]",
    "message": "Secrets must NOT be exposed via EXPO_PUBLIC_* — they ship in the bundle. Use ~/.netrc / ~/.gradle/gradle.properties at build time."
  },
  {
    "selector": "Literal[value=/^sk\\.[A-Za-z0-9_-]{40,}/]",
    "message": "Hard-coded Mapbox sk. secret detected. Move to ~/.netrc / ~/.gradle/gradle.properties."
  }
]
```

Verify the rule by running `npm run lint` after adding a test fixture file containing the offending pattern; CI must reject it.

### Real-SQLite integration test setup (D-10)

```typescript
// apps/mobile-rn/src/__tests__/sessionRepository.integration.test.ts (NEW)
// Source: expo-sqlite@16.0.10 API; pattern adapted from TESTING.md.
import * as SQLite from 'expo-sqlite';
import { createSession, finalizeSession, findActiveSession } from '../storage/sessionRepository';
import { runMigrations, _setDatabase } from '../storage/database';

describe('sessionRepository (real SQLite)', () => {
  beforeEach(() => {
    const db = SQLite.openDatabaseSync(':memory:');
    _setDatabase(db); // requires database.ts to expose this test hook (small refactor)
    runMigrations();
  });

  it('crash-recovery returns last unfinalized session', () => {
    const id = Date.now();
    createSession({ id, startedAt: id, activityType: 'run' });
    // simulate crash: never call finalizeSession
    const recovered = findActiveSession();
    expect(recovered?.id).toBe(id);
    expect(recovered?.endedAt).toBeNull();
  });

  it('finalize sets endedAt and isClosed', () => {
    const id = Date.now();
    createSession({ id, startedAt: id, activityType: 'run' });
    finalizeSession(id, { endedAt: id + 60_000, isClosed: true, distanceM: 5000, areaM2: 1000, calcMethod: 'shoelace_simple', avgHrBpm: 140, maxHrBpm: 165, caloriesKcal: 300 });
    const found = findActiveSession();
    expect(found).toBeNull(); // no longer "active"
  });
});
```

**Probe first:** start PHASE1-07 work with a 5-minute spike running `SQLite.openDatabaseSync(':memory:')` in a test to confirm it works under `jest-expo`. If it fails, fall back to `better-sqlite3` per Pitfall 8.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `PolylineAnnotation` for tracks | `LineLayer` + `GeoJsonSource` | Mapbox SDK v9 (~2021) | Already-shipped pattern in this codebase |
| `Mapbox.startTelemetryAsync` deprecation | (none — telemetry off-by-default) | @rnmapbox/maps v10 | No-op for this project |
| `expo-haptics@13.x` (Selection / Impact / Notification) | `expo-haptics@14.1.x` (same API, SDK 54 compat) | Expo SDK 54 | No API changes; pin to 14.1.4 |
| `@turf/turf@6.x` mutating simplify default | `@turf/simplify@7.3.5` (mutate=false default) | Turf 7 release | Existing dep — verify `mutate: false` in calls |
| Mapbox legacy `offlineManager` (pre-v10) | `offlineManager` (v10) — `OfflineCreatePackOptions` shape | @rnmapbox/maps v10 | Already on v10; `offlineManagerLegacy.ts` exists in node_modules but unused |

**Deprecated/outdated:**
- `expo-file-system/legacy` — used in `mediaUpload.ts` (CONCERNS.md). Not Phase 1 scope but flag in ADR if surface area touched.
- `expo-sqlite` callback API (Phase 0 era) — already migrated to sync API; no further work.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `expo-sqlite@16.0.10` `openDatabaseSync(':memory:')` works under `jest-expo@~54.0.0` | Real-SQLite tests | Fallback to `better-sqlite3@12.10.0` adds devDep + shim |
| A2 | Mapbox iOS 6000-tile-per-pack cap still applies in `@rnmapbox/maps@10.3.0` | Region picker size cap | Cap may have changed in v10; if higher, app over-restricts user (cosmetic) |
| A3 | `expo-haptics@~14.1.4` is the canonical SDK 54 version | Stack | Could be `14.1.x` lower; verify by `npx expo install expo-haptics` selecting the resolved version |
| A4 | iOS Significant Location Changes equivalent via `expo-location` is `Accuracy.Lowest + distanceInterval:500` | Pattern 5 | True SLC requires a custom native module; field-test may show this approximation is too coarse |
| A5 | `Location.startLocationUpdatesAsync(TASK_NAME, opts)` is idempotent and re-configures live | Pattern 5 | If not idempotent, must `stop` then `start` — adds a 1-2s gap during sampling switch |
| A6 | Battery cost of `Haptics.notificationAsync` per closure is negligible | Stack | If non-negligible, gate behind setting; closures are rare anyway |

**Resolution:** A1 should be probed as the FIRST step of PHASE1-07 (5-min spike, no commit yet). A2, A4, A5 surface in field testing — document outcome in ADR D-36.

## Open Questions

1. **Real `getPackEstimateSize` availability** — does any version of `@rnmapbox/maps` v10 expose a size-estimate API?
   - What we know: `lib/typescript/src/modules/offline/offlineManager.d.ts` declares only `createPack`, `invalidatePack`, `deletePack`, `getPack(name)`, `getPacks()`. No size estimate method.
   - What's unclear: Whether a future v10.x or v11 will add it.
   - Recommendation: Use local Web Mercator tile-count math (Pattern 4) — documented and deterministic. Revisit if Mapbox adds the API.

2. **Hook tests with `@testing-library/react-native@13.3.3`** — what's the canonical pattern for testing custom hooks with `useActivityStore` selector subscriptions?
   - What we know: `@testing-library/react-native@13.3.3` is installed but unused. `renderHook` API exists.
   - What's unclear: Whether `useActivityStore` (Zustand) needs special setup under `renderHook` (it should not — Zustand has no React-tree dependency).
   - Recommendation: First hook test should be `useTrackerCamera` — simplest, validates the pattern, unlocks D-06.

3. **Field-test result schema** — should test results be machine-readable (JSON) or markdown-only?
   - What we know: D-03 commits to markdown rows + GPX files + battery photos. Existing `tests/FIELD_PROTOCOL.md` already has the markdown row template.
   - What's unclear: Will downstream phases (e.g. ADR-0005) want to query results programmatically?
   - Recommendation: Stay markdown for now per D-03; add a JSON sidecar `tests/runs/<device>/<test>/<timestamp>.json` ONLY if a consumer materializes.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | npm install, jest | ✓ | (system) | — |
| npm | dep install | ✓ | bundled | — |
| Xcode | iOS field test (PHASE1-01..04 on iPhone) | ✗ | — | Pixel-only field testing until installed (per STATUS.md TODO) |
| Android SDK / Pixel device | Pixel field test | ✓ | per STATUS.md "APK builds clean" | — |
| Chinese-Android device | T1/T2/T6/T7/T8 OEM-killer validation | ✗ | — | Order or borrow Xiaomi/Realme/Oppo before PHASE1-04 close-out |
| Mapbox dashboard access | PHASE1-13 token rotation | ✓ (per ownership) | — | — |
| `~/.netrc` write access | PHASE1-13 build-time token | ✓ | (filesystem) | — |
| `~/.gradle/gradle.properties` | PHASE1-13 Android build | ✓ | (filesystem) | — |
| Garmin reference watch | T1/T2 distance + area baseline | per CONTEXT.md, owner-driven | — | — |
| @rnmapbox/maps@10.3.0 (installed) | All map work | ✓ | 10.3.0 | — |
| @turf/simplify@7.3.5 (installed) | PHASE1-05 | ✓ | 7.3.5 | — |
| expo-haptics (NOT installed) | PHASE1-08 | ✗ | — | Install: `npx expo install expo-haptics` (resolves ~14.1.4) |

**Missing dependencies with no fallback:**
- Xcode + iPhone — blocks PHASE1-01..04 iPhone runs only. PHASE1-05..14 code work proceeds in parallel.
- Chinese-Android device — blocks PHASE1-04 close-out only.

**Missing dependencies with fallback:**
- `expo-haptics` — single-command install, no fallback needed.

## Validation Architecture

> `workflow.nyquist_validation: true` per `.planning/config.json` — section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7 with `jest-expo@~54.0.0` preset |
| Config file | `apps/mobile-rn/jest.config.js` |
| Quick run command | `cd apps/mobile-rn && npm test -- --testPathPattern='<file-pattern>'` |
| Full suite command | `cd apps/mobile-rn && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PHASE1-01 | T1 5km ref loop, ≤3% distance error | manual-only (field) | — | N/A (manual) |
| PHASE1-02 | T2/T9 area ≤5% error | unit (sim) + manual (field) | `npm test -- AreaCalculator.test.ts` | ✅ exists |
| PHASE1-03 | T6 battery ≤10%/h, mem ≤100MB | manual-only (field) | — | N/A (manual) |
| PHASE1-04 | T8 background ≥95% record-time | manual-only (field) | — | N/A (manual) |
| PHASE1-05 | T7 ≥50fps at 5000+ pts; D-P kicks in | unit (sim) + manual (field) | `npm test -- TrackLayer.test.tsx` | ❌ Wave 0 |
| PHASE1-06 | Hook extraction does not change behavior | snapshot + hook unit | `npm test -- 'hooks/'` | ❌ Wave 0 |
| PHASE1-07 | SessionManager API parity with current store | unit + integration | `npm test -- SessionManager.test.ts sessionRepository.integration.test.ts` | ❌ Wave 0 |
| PHASE1-08 | Haptic + toast fires once on first closure | hook unit | `npm test -- useClosureFeedback.test.tsx` | ❌ Wave 0 |
| PHASE1-09 | Stop+Save lands on RunDetailsScreen | snapshot + nav assertion | `npm test -- RunDetailsScreen.snapshot.test.tsx` | ❌ Wave 0 |
| PHASE1-10 | Region picker validates size before download | unit | `npm test -- offline.test.ts` | ❌ Wave 0 (new for `estimatePackSize`) |
| PHASE1-11 | `setSamplingMode` switches expo-location config | mock-adapter unit | `npm test -- ExpoLocationAdapter.test.ts` | ❌ Wave 0 |
| PHASE1-12 | iOS gap-resume triggers `pipeline.reset()` | unit | `npm test -- gapResume.test.ts` | ❌ Wave 0 |
| PHASE1-13 | ESLint rule rejects EXPO_PUBLIC_*_SECRET | lint smoke | `npm run lint -- src/__fixtures__/secret.lint-fixture.ts` (should fail) | ❌ Wave 0 |
| PHASE1-14 | STATUS.md table updated | docs review | grep `PHASE1-14` STATUS.md | N/A (docs) |

### Sampling Rate

- **Per task commit:** `npm test -- --testPathPattern='<changed-file-pattern>'` + `npm run typecheck` + `npm run lint`.
- **Per wave merge:** `npm test` (full suite, currently 435 tests + new ones).
- **Phase gate:** Full Jest suite green AND all 14 REQ-IDs marked done in `STATUS.md` AND PHASE1-01..04 field results captured in `tests/FIELD_PROTOCOL.md`.

### Wave 0 Gaps

- [ ] `apps/mobile-rn/src/__tests__/SessionManager.test.ts` — covers PHASE1-07
- [ ] `apps/mobile-rn/src/__tests__/sessionRepository.integration.test.ts` — real-SQLite (D-10, CONCERNS.md R5)
- [ ] `apps/mobile-rn/src/__tests__/walletRepository.integration.test.ts` — real-SQLite (R5)
- [ ] `apps/mobile-rn/src/__tests__/lapRepository.integration.test.ts` — real-SQLite (R5)
- [ ] `apps/mobile-rn/src/__tests__/TrackLayer.test.tsx` — simplify trigger + tolerance scaling
- [ ] `apps/mobile-rn/src/__tests__/useClosureFeedback.test.tsx` — haptic+toast effect using `@testing-library/react-native renderHook`
- [ ] `apps/mobile-rn/src/__tests__/offline.test.ts` — `estimatePackSize` math + tile-cap rejection
- [ ] `apps/mobile-rn/src/__tests__/ExpoLocationAdapter.test.ts` — `setSamplingMode` mock assertion
- [ ] `apps/mobile-rn/src/__tests__/gapResume.test.ts` — AppState gap detector
- [ ] `apps/mobile-rn/src/__tests__/RunDetailsScreen.snapshot.test.tsx` — first React component test in suite
- [ ] `apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts` — ESLint negative fixture
- [ ] `apps/mobile-rn/src/__tests__/useTrackerCamera.test.tsx`, `useLayerVisibility.test.tsx`, `usePauseUI.test.tsx` — hooks unit
- [ ] Probe-spike: confirm `expo-sqlite@16.0.10` `openDatabaseSync(':memory:')` loads under jest-expo BEFORE writing integration tests
- [ ] No new framework install needed; verify jest-expo + @testing-library are sufficient

## Security Domain

> `security_enforcement` defaults to enabled. Phase 1 closure includes token rotation (PHASE1-13) — security-relevant.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (Phase 2 work — HEALTH-* OAuth) | — |
| V3 Session Management | no (mobile-only Phase 1) | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes (region picker bounds) | Reject NE/SW where `ne.lat < sw.lat` or `|ne.lng - sw.lng| > 1.0deg`; max 50 MB estimated |
| V6 Cryptography | yes (Mapbox secret token storage) | Never in committed `.env`; `~/.netrc` (mode 600) + `~/.gradle/gradle.properties` (mode 600); ESLint guard rejects `EXPO_PUBLIC_*_SECRET` |
| V7 Error Handling | yes | `Haptics.*` errors swallowed silently; offline pack errors logged but not surfaced to user beyond toast |
| V14 Configuration | yes | Token rotation procedure documented in `docs/SECRETS.md`; pre-commit / CI grep guard for `sk\.` strings |

### Known Threat Patterns for {Expo RN + Mapbox}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Mapbox secret token leaked in JS bundle | Info Disclosure | sk-token NEVER in `process.env.EXPO_PUBLIC_*`; only in `~/.netrc` (iOS Pods) and `~/.gradle/gradle.properties` (Android) — both build-time, not bundled |
| Public Mapbox pk token abused for traffic | Info Disclosure / DoS | Bundle ID restriction + Android SHA-256 fingerprint on pk token (Mapbox dashboard); URL restriction not applicable to mobile |
| Offline pack injected with unrestricted region | Tampering / Cost | Picker validates `estimatePackSize().tiles ≤ 5500` and `area ≤ 50 MB`; user must confirm |
| Sensitive GPS data exported to GPX via Share | Privacy | Phase 1 ships no privacy zones (deferred to Phase 4); ADR-0005 should note GPS exports remain unmasked through Phase 1 |
| Mapbox token rotation rollback to old pk | Replay | Treat old pk as compromised; revoke immediately in dashboard, do not keep both active. Document one-step rotation in `docs/SECRETS.md`. |

## Project Constraints (from CLAUDE.md)

| Directive | Source | Application to Phase 1 |
|-----------|--------|------------------------|
| Read `docs/RUNNING_ECOSYSTEM_TZ.md` §2.3-2.5, §3.15, §6.6, §10.5, §10.6 before any task | CLAUDE.md "Документы которые ты ВСЕГДА читаешь" | Cited inline above; field-test thresholds (≤3% distance / ≤5% area / ≤10%/h battery / ≤100MB mem / ≥95% record-time / ≥50 fps) come from §2.4 NFR table |
| No `@rnmapbox/maps` import outside `src/map/` | CLAUDE.md "Что НЕ делать никогда" + ESLint `.eslintrc.json` `no-restricted-imports` | Region picker (PHASE1-10) mounts `MapboxView` only; corner handles are RN `<View>` overlays |
| Area calc only through local projection | CLAUDE.md §"Что НЕ делать никогда" + ТЗ §6.6 | Already enforced by `AreaCalculator.ts`; simplified track MUST NOT be fed into area calc (D-14 dual sources) |
| Never use `PolylineAnnotation` for track | CLAUDE.md + ТЗ §10.5 | Continue with `LineLayer + GeoJsonSource` — applies to picker overlay too (use `FillLayer` for the rectangle) |
| No secrets in `.env` checked into git | CLAUDE.md | PHASE1-13 sk-token lives in `~/.netrc` / `~/.gradle/gradle.properties` ONLY; ESLint guard catches regressions |
| Coverage targets: 80%+ pipeline, 90%+ area | CLAUDE.md | Already met (93% / 95%); new SessionManager test target 80%+ |
| Russian commit/UI language unless EN explicitly | CLAUDE.md context | Toast text in RU (D-19); commit messages RU/EN mixed per existing pattern |
| Domain pure (no Mapbox/SQLite/Zustand) | CLAUDE.md | SessionManager class lives in `src/domain/session/` or `src/modules/session/` — accepts repos via constructor DI |
| ADR for significant decisions | CLAUDE.md "Когда закрываешь задачу" | PHASE1-14 produces `docs/DECISIONS/0005-phase-1-field-test-outcomes.md` if surprises (D-36) |
| Update `STATUS.md` on close | CLAUDE.md | PHASE1-14 explicit |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `expo-sqlite` in-process fails under jest-expo | Medium | High (D-10 blocked) | First task = 5-min probe; fallback to `better-sqlite3` shim |
| Mapbox token rotation breaks iOS / Android builds | Low | High | Test build dev → preview profiles BEFORE deleting old pk |
| Chinese-Android device exceeds 10%/h battery despite adaptive sampling | Medium | Medium | Document as known limitation in ADR; do not block phase close (per D-36) |
| `@turf/simplify` 7→8 breaking changes leak in (e.g. via `@turf/turf` peer update) | Low | Medium | Pin `@turf/simplify@7.3.5` exact in package.json (currently `^7.3.5`) |
| ESLint AST rule false-positives on unrelated `sk` strings | Medium | Low | Constrain rule via length regex `{40,}` (Mapbox sk tokens are long) — see Code Examples |
| iPhone unblocking (Xcode install) drags past PHASE1-04 close | Medium | Medium | PHASE1-04 needs all three devices; treat as acquisition-bound, not code-bound; PHASE1-05..14 do not block |
| Region picker draggable rectangle UX is fiddly on small phones | Medium | Low | Provide a "lock corners" toggle and numeric input fallback; iterate post-field-test |
| SessionManager refactor introduces regression in closure detection | Medium | High | Phase A keeps logic in place — extract behavior incrementally; full Jest suite must stay green at every commit |
| ADR-0005 field-test surprises invalidate Phase 2 timeline | Low | Medium | Document surprises in ADR, do not delete Phase 1 close-out; rebudget Phase 2 |

## Sources

### Primary (HIGH confidence)

- `apps/mobile-rn/node_modules/@rnmapbox/maps/lib/typescript/src/modules/offline/offlineManager.d.ts` — confirmed `createPack` signature, no `getPackEstimateSize`, bounds order `[ne, sw]` [VERIFIED via `_makeLatLngBounds` source]
- `apps/mobile-rn/node_modules/@rnmapbox/maps/lib/module/modules/offline/OfflineCreatePackOptions.js` — confirmed `[ne, sw] = bounds` destructure
- `apps/mobile-rn/package.json` — verified installed versions of `@turf/simplify@^7.3.5`, `@rnmapbox/maps@^10.3.0`, `expo-location@~19.0.8`, `expo-sqlite@~16.0.10`, `expo-haptics` NOT installed
- `npm view expo-haptics versions` — confirmed `14.1.4` is stable; `15.0.x` is SDK 55
- `apps/mobile-rn/src/map/offline.ts` — existing wrapper inspected, bounds-order bug identified
- `apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts` — existing expo-location config inspected
- `apps/mobile-rn/src/state/activity.ts` — 466-line god-store inspected, closureFired event location confirmed at lines 119-130
- `apps/mobile-rn/.eslintrc.json` — existing `no-restricted-imports` for `@rnmapbox/maps` confirmed
- `apps/mobile-rn/jest.config.js` — `jest-expo@~54` preset + transformIgnorePatterns whitelist confirmed
- `.planning/codebase/CONCERNS.md` — R5, R7, R9, R18 mapped to phase work
- `.planning/codebase/TESTING.md` — Jest patterns + adapter mock conventions confirmed
- `CLAUDE.md` — project rules extracted to Project Constraints table

### Secondary (MEDIUM confidence)

- `docs.expo.dev/versions/v54.0.0/sdk/haptics/` — `notificationAsync(NotificationFeedbackType.Success)` API [CITED]
- `docs.expo.dev/versions/v54.0.0/sdk/location/` — `Location.Accuracy.*` enums + `startLocationUpdatesAsync` idempotency [CITED]
- `turfjs.org/docs/#simplify` — `mutate: false` default in v7 [CITED]
- `docs.mapbox.com/help/glossary/offline-tile-limits/` — 6000-tile cap on iOS [CITED]

### Tertiary (LOW confidence — needs validation in field)

- iOS SLC approximation via `Accuracy.Lowest + distanceInterval:500` — pattern documented in Expo community discussions; not verified against actual SLC behavior on device
- `expo-sqlite@16.0.10` `openDatabaseSync(':memory:')` working under `jest-expo@~54.0.0` — assumed; probe required (Pitfall 8)
- Battery cost of `Haptics.notificationAsync` — assumed negligible based on single-call-per-closure frequency

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against installed `node_modules` + npm registry.
- Architecture: HIGH — patterns mirror existing code conventions verified in source.
- Pitfalls: MEDIUM — pitfalls 1-7 are verified via source / docs; pitfall 8 (expo-sqlite under jest) is ASSUMED until probed.
- Validation: HIGH — Jest framework already proven at 435/435; gaps enumerated explicitly.
- Security: HIGH — token rotation is operational, not novel; ESLint AST patterns verified.

**Research date:** 2026-05-14
**Valid until:** 2026-06-13 (30 days — stack is stable; only SDK upgrade or Mapbox dashboard change invalidates)

---

*Phase: 1-Validate-Close-Territory-Core*
*Researched: 2026-05-14*
*Single-pass research; informed by CONTEXT.md 37 decisions + codebase analysis docs + verified source/registry inspection.*
