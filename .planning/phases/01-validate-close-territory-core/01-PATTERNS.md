# Phase 1: Validate & Close Territory Core - Pattern Map

**Mapped:** 2026-05-14
**Files analyzed:** 19 (8 NEW source + 7 MODIFIED source + 4+ test/docs)
**Analogs found:** 17 / 19 (89%)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/domain/session/SessionManager.ts` (NEW) | domain class (pure) | event-driven / imperative | `src/domain/ClosureDetector.ts` + extraction from `src/state/activity.ts` | role-match (constructor-DI imperative class) |
| `src/state/activity.ts` (MOD) | zustand store wrapper | event-driven | `src/modules/gamification/state/useXpStore.ts` | role-match (slim store delegating to pure helper) |
| `src/navigation/screens/record/hooks/useTrackerCamera.ts` (NEW) | react hook | request-response (store→camera) | first hook in codebase — partial analog: `useActivityStore` selector idiom from `TrackerLiveScreen.tsx` | partial (greenfield pattern) |
| `src/navigation/screens/record/hooks/useLayerVisibility.ts` (NEW) | react hook | request-response | same as above | partial |
| `src/navigation/screens/record/hooks/usePauseUI.ts` (NEW) | react hook | request-response | same as above | partial |
| `src/navigation/screens/record/hooks/useClosureFeedback.ts` (NEW) | react hook (effect) | event-driven (closureFired) | `useEffect` pattern in `TrackerLiveScreen.tsx:63-66` (interval tick) | role-match |
| `src/ui/Toast.tsx` (NEW) | UI overlay + Provider | event-driven (imperative show) | `src/design/ThemeProvider.tsx` (context provider pattern) + RESEARCH.md Code Example | role-match (Context-provider) |
| `src/navigation/screens/record/TrackerLiveScreen.tsx` (MOD) | screen | event-driven | existing file — refactor in place | exact |
| `src/map/offline.ts` (MOD) | adapter wrapper | request-response | existing file — bug-fix + extend with `createCustomPack`/`estimatePackSize` | exact |
| `src/navigation/screens/me/RegionPickerScreen.tsx` (NEW) | screen | request-response | `src/navigation/screens/me/SettingsScreen.tsx` (Settings child) + `TrackerLiveScreen.tsx` (full-screen Mapbox host) | role-match |
| `src/location/LocationAdapter.ts` (MOD) | interface | — | existing file — interface extension | exact |
| `src/location/adapters/ExpoLocationAdapter.ts` (MOD) | adapter impl | streaming | existing file — method addition | exact |
| `.eslintrc.json` (MOD) | config | — | existing file — add `no-restricted-syntax` rule | exact |
| `docs/SECRETS.md` (MOD/NEW) | docs | — | existing docs (`docs/INTEGRATIONS.md`, `docs/AUDIT.md`) | role-match |
| `STATUS.md`, `docs/DEVELOPMENT_PLAN.md` (MOD) | docs | — | existing files — closure section update | exact |
| `docs/DECISIONS/0005-phase-1-field-test-outcomes.md` (NEW) | ADR | — | `docs/DECISIONS/0004-feed-backend-cleanup.md` (latest ADR) | role-match |
| `src/__tests__/sessionRepository.integration.test.ts` (NEW) | integration test | CRUD | `src/__tests__/walletStore.test.ts` (mocked) + RESEARCH.md Code Example for real-SQLite | partial (real-SQLite is greenfield) |
| `src/__tests__/SessionManager.test.ts` (NEW) | unit test | — | `src/__tests__/pipeline.test.ts` (pure-class unit test) | exact |
| `src/__tests__/useClosureFeedback.test.tsx` + other hook tests (NEW) | hook test | — | no existing hook tests — first user of `@testing-library/react-native@13.3.3 renderHook` | none (greenfield) |
| `src/__tests__/offline.test.ts` (NEW) | unit test | — | `src/__tests__/pipeline.test.ts` (function-level unit test) | role-match |
| `src/__tests__/ExpoLocationAdapter.test.ts` (NEW) | unit test | — | `src/__tests__/realtimeAdapter.test.ts` (adapter mock test) | role-match |
| `src/__fixtures__/secret.lint-fixture.ts` (NEW) | lint fixture | — | no existing fixture pattern | none |

## Pattern Assignments

### `src/domain/session/SessionManager.ts` (domain class, pure)

**Analog:** `src/domain/ClosureDetector.ts` (constructor-injected listener; reset; explicit state) + extracted logic from `src/state/activity.ts` (the source god-store)

**Source-file path conventions to follow** (from `CONVENTIONS.md`):
- PascalCase filename `SessionManager.ts` (single-class module)
- No default export; named class export
- Pure domain — no `expo-sqlite`, no `@rnmapbox/maps`, no `zustand`, no `react`
- Russian module header with phase tag + ТЗ § reference

**Class skeleton pattern** (copy from `src/domain/ClosureDetector.ts:16-47`):
```typescript
// Module header (mandatory for domain — match style of ClosureDetector.ts:1-3):
// SessionManager: pure imperative lifecycle owner (start/pause/resume/ingestRawPoint/markLap/stop/save/discard/recover).
// Phase 1 / PHASE1-07. См. ТЗ §4.3 (pipeline ownership), §4.5 (crash recovery).
// Domain-pure: НЕ зависит от Mapbox / SQLite / zustand / React. Repos и pipeline инжектятся через constructor.

export class ClosureDetector {
  private fired = false;

  constructor(
    private readonly listener: (event: ClosureEvent) => void,
    private readonly minDistanceM: number = DEFAULT_MIN_DISTANCE_M,
    private readonly closeDistanceM: number = DEFAULT_CLOSE_DISTANCE_M,
  ) {}

  check(points: readonly RawPoint[]): void {
    if (this.fired) return;
    // ...
    this.fired = true;
    this.listener({ totalDistanceM: dist, closeGapM: gap });
  }

  reset(): void { this.fired = false; }
}
```

**State + lifecycle pattern** (extract from `src/state/activity.ts:187-456`):
- `start(activityType)` — mirror `activity.ts:187-218` (reset pipeline/pauseDetector/closureDetector, create session row via injected `repo.createSession`, emit snapshot)
- `stop()` — mirror `activity.ts:220-349` (flush buffer, compute distance/area/HR/calories/records via injected dependencies, call `repo.finalizeSession`)
- `acceptPoint(point)` — mirror `activity.ts:351-367` (buffer + flush + closureDetector.check + maybeRecomputeArea)
- `ingestRawPoint(raw)` — mirror `activity.ts:151-165` (move out of module scope into method)
- `recoverLast()` — mirror `activity.ts:405-441` (load via injected `repo.findActiveSession + loadPointsForSession`)
- `markLap()` — mirror `activity.ts:443-456` (uses functional set semantics; here just mutate internal `laps` array)

**Notify-on-change pattern** (constructor takes `onChange: () => void`):
```typescript
constructor(
  private readonly pipeline: Pipeline,
  private readonly pauseDetector: PauseDetector,
  private readonly closureDetector: ClosureDetector,
  private readonly repo: SessionRepo,  // interface defined in SessionManager.ts
  private readonly onChange: () => void,
) {}

private emit(): void { this.onChange(); }
```
The Zustand store passes `() => useActivityStore.setState(manager.snapshot())` — see Pitfall 4 in RESEARCH.md.

**Error handling pattern** (from `activity.ts:194-198`, `225-267`):
```typescript
try {
  createSession({ id: sessionId, startedAt: sessionId, activityType });
} catch (e) {
  console.error('[activity] createSession failed', e);
}
```
Store-layer caught errors logged with `console.error('[session] <op> failed', e)`. Never throw out of manager methods that are called from event callbacks.

**Repo interface pattern** (define inside the file, matches existing repo signatures):
```typescript
export interface SessionRepo {
  createSession(s: { id: number; startedAt: number; activityType: ActivityType }): void;
  appendPoints(sid: number, pts: Point[]): void;
  finalizeSession(sid: number, finals: { endedAt: number; isClosed: boolean | null; ... }): void;
  findActiveSession(): Session | null;
  loadPointsForSession(sid: number): Point[];
  deleteSession(sid: number): void;
  appendLapsForSession(sid: number, laps: Lap[]): void;
  aggregateHrForSession(sid: number): { avgHrBpm: number | null; maxHrBpm: number | null };
}
```
Concrete impl in `state/activity.ts` wires real `sessionRepository` + `pointRepository` + etc.

---

### `src/state/activity.ts` (zustand store wrapper, post-refactor)

**Analog:** `src/modules/gamification/state/useXpStore.ts` (slim store; delegates formula to pure helper)

**Imports pattern** (from `useXpStore.ts:1-11`):
```typescript
// Zustand store: <one-line purpose>.
// Phase X / Mx.
import { create } from 'zustand';

import { /* pure helpers */ } from '../domain/<feature>/<helper>';
```

**Type shape pattern** (from `useXpStore.ts:13-30` + existing `activity.ts:34-84`):
- Define `type ActivityStore = { ...state, ...actions };` — keep current shape exposed to UI for backward compat
- Add private slot `_manager: SessionManager` (or hold it outside store via module-level `const manager`)

**Store factory pattern (post-refactor)** — module-level manager + slim store:
```typescript
// Module-level singletons (kept from current file lines 103-117).
const pipeline = createDefaultPipeline({ onDrop: ... });
const pauseDetector = new PauseDetector(...);
const closureDetector = new ClosureDetector(...);

const repo: SessionRepo = {
  createSession, finalizeSession, deleteSession, findActiveSession,
  appendPoints, loadPointsForSession,
  appendLapsForSession, aggregateHrForSession,
};

const manager = new SessionManager(pipeline, pauseDetector, closureDetector, repo, () => {
  useActivityStore.setState(manager.snapshot());
});

export function ingestRawPoint(raw: RawPoint): void {
  manager.ingestRawPoint(raw);
}

export const useActivityStore = create<ActivityStore>(() => ({
  ...manager.snapshot(),
  start: (t) => manager.start(t),
  stop: () => manager.stop(),
  reset: () => manager.reset(),
  markLap: () => manager.markLap(),
  acceptPoint: (p) => manager.acceptPoint(p),
  recoverLast: () => manager.recoverLast(),
  // ... other actions delegate
}));
```

**Race-safe set pattern** (preserve from `activity.ts:443-456`):
```typescript
// Functional set: гарантирует, что мы читаем актуальный points даже если
// между вычислением и записью пришла новая точка через acceptPoint.
set((s) => { /* compute from s */ });
```
CONVENTIONS.md §State Management: "Use `set((s) => ({ ... }))` (functional) when the next state depends on the current state — STATUS R7 fixed a race in `markLap`". The SessionManager must preserve this invariant when it internally mutates `this.laps`.

---

### `src/navigation/screens/record/hooks/useTrackerCamera.ts` (react hook)

**Analog:** No pre-existing custom hook. Selector idiom + `useEffect` pattern is drawn from `TrackerLiveScreen.tsx`.

**Imports pattern** (from `TrackerLiveScreen.tsx:16-40`):
```typescript
import { useEffect, useMemo, useRef, useState } from 'react';
import { useActivityStore } from '../../../../state/activity';
```

**Selector subscription pattern** (from `TrackerLiveScreen.tsx:48-59`):
```typescript
const points = useActivityStore((s) => s.points);
const startedAt = useActivityStore((s) => s.startedAt);
const isPaused = useActivityStore((s) => s.isPaused);
const closureFired = useActivityStore((s) => s.closureFired);
```
**Critical:** select primitives / arrays — never the whole store object. Each `useActivityStore(...)` call is a separate subscription.

**Effect pattern with cleanup** (from `TrackerLiveScreen.tsx:63-66`):
```typescript
useEffect(() => {
  const id = setInterval(() => setNow(Date.now()), 1000);
  return () => clearInterval(id);
}, []);
```

**Return-value contract for a hook:**
```typescript
export function useTrackerCamera(): {
  cameraProps: { followUserLocation: boolean; followZoomLevel: number; ... };
  fitToBounds: (bounds: [[number, number], [number, number]]) => void;
} { /* ... */ }
```
Hook returns a plain object whose keys map 1:1 to the props the screen passes to `MapboxView`. Keep the hook UI-shape-aware so the screen body shrinks.

**Same patterns apply to `useLayerVisibility.ts` and `usePauseUI.ts`** — they read `isPaused`, `closureFired`, `points` from `useActivityStore`, return derived flags (e.g. `{ showCorridor, showTrack, showZone, dimOverlay }`).

---

### `src/navigation/screens/record/hooks/useClosureFeedback.ts` (react hook, effect)

**Analog:** `useEffect` interval pattern in `TrackerLiveScreen.tsx:63-66` + RESEARCH.md Pattern 3.

**Imports + effect pattern** (RESEARCH.md lines 305-323, ready to copy verbatim — `Haptics.notificationAsync` + Toast `show`):
```typescript
import { useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { useActivityStore } from '../../../../state/activity';
import { useToast } from '../../../../ui/Toast';
import { formatArea } from '../../../../ui/format';

export function useClosureFeedback() {
  const closureFired = useActivityStore((s) => s.closureFired);
  const areaM2 = useActivityStore((s) => s.areaM2);
  const { show } = useToast();
  useEffect(() => {
    if (!closureFired || areaM2 === null) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      .catch(() => { /* iOS sim / unsupported — silent */ });
    show(`Зона замкнута! Площадь: ${formatArea(areaM2)}`);
  }, [closureFired, areaM2, show]);
}
```

**Catch-swallow pattern** is mandatory — Pitfall 2 in RESEARCH.md: `Haptics.notificationAsync` rejects on simulator / older Android. Match the swallow style of the existing dynamic-import try/catch wrap in `state/auth.ts:217-251`.

**`formatArea` already exists** in `src/ui/format.ts:18-22` and handles m²/га/км² unit selection — do NOT reimplement.

---

### `src/ui/Toast.tsx` (UI provider + overlay)

**Analog:** `src/design/ThemeProvider.tsx` for the Context-provider shape; RESEARCH.md lines 534-577 give a ready-to-paste implementation.

**Imports pattern** (from existing UI files like `src/ui/SessionDetailModal.tsx:4-13`):
```typescript
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
```

**Provider + context pattern** (copy from RESEARCH.md lines 540-567):
```typescript
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
```

**Theme integration**: prefer `useTheme()` from `src/design` instead of hard-coded `#10B981` — the existing token name is `t.lime` (see `TrackerLiveScreen.tsx:263`). Use `t.lime` for the background and `t.text` for text on light tint, or stay on `#10B981` direct (the bottom-line `.lime` token resolves to it). CLAUDE.md `Принципы кода`: design tokens, not hard-coded colors.

**Wire-up in App.tsx** (mount above RootNavigator — pattern from `App.tsx:70-86`):
```typescript
// App.tsx — wrap RootNavigator
<ThemeProvider>
  <ToastProvider>
    <StatusBar style="light" />
    <RootNavigator />
  </ToastProvider>
</ThemeProvider>
```

---

### `src/navigation/screens/record/TrackerLiveScreen.tsx` (MODIFY — wire haptics + toast + hooks)

**Analog:** the file itself (lines 44-316). Refactor moves selector blocks into the new hooks and adds `useClosureFeedback()` call.

**Refactor pattern** — preserve the existing flow; replace lines 48-79 (selectors + memo blocks) with:
```typescript
// After refactor — screen body shrinks to ~150 lines:
const cameraProps = useTrackerCamera();
const layerFlags = useLayerVisibility();
const pauseUi = usePauseUI();
useClosureFeedback(); // PHASE1-08 — effect, no return
```

**Stop-flow preservation** — lines 94-139 (Alert + `nav.replace('RunDetails', ...)`) MUST stay untouched per CONTEXT.md D-20 (Summary screen flow). Verify the existing `nav.replace` lands on `RunDetailsScreen.tsx`.

**Style pattern reuse**: `SubMetric` component at lines 318-354 stays — it's screen-local presentation, not extractable.

---

### `src/map/offline.ts` (MODIFY — bug fix + extend)

**Analog:** the file itself; RESEARCH.md Pattern 4 gives extension code.

**Bug fix pattern** — current bounds at lines 49-52 must change from `[[swLon, swLat], [neLon, neLat]]` to `[[neLon, neLat], [swLon, swLat]]`. See RESEARCH.md Pitfall 1 + verified evidence in `node_modules/@rnmapbox/maps/lib/module/modules/offline/OfflineCreatePackOptions.js`.

**`createCustomPack` extension pattern** (RESEARCH.md lines 333-355, paste verbatim):
```typescript
// CRITICAL: bounds order is [NE, SW] in @rnmapbox/maps v10 — NOT [SW, NE].
export async function createCustomPack(opts: {
  name: string;
  ne: [number, number];  // [lng, lat]
  sw: [number, number];
  styleUrl?: string;
  minZoom?: number;
  maxZoom?: number;
  onProgress?: (p: number) => void;
}): Promise<void> {
  await offlineManager.createPack(
    {
      name: opts.name,
      styleURL: opts.styleUrl ?? DEFAULT_STYLE,
      minZoom: opts.minZoom ?? 12,
      maxZoom: opts.maxZoom ?? 16,
      bounds: [opts.ne, opts.sw], // [NE, SW]
    },
    (_region, status) => opts.onProgress?.(status.percentage ?? 0),
    (_region, error) => console.error('[offline] custom pack error', error),
  );
}
```

**`estimatePackSize` pattern** — paste RESEARCH.md lines 358-371; uses Web Mercator tile math (no Mapbox API call). Tests in `src/__tests__/offline.test.ts` should pin specific tile counts for a known bbox.

**Error logging style** preserved from current line 59: `console.error('[offline] pack error', error)` — keep `[offline]` scope tag (matches CONVENTIONS.md §Logging).

**Module-level invariants** — extract `DEFAULT_STYLE` const (already present at line 13) and reuse in `createCustomPack`.

---

### `src/navigation/screens/me/RegionPickerScreen.tsx` (NEW)

**Analog (screen scaffold):** `src/navigation/screens/me/SettingsScreen.tsx:1-90` for header + nav patterns. **Analog (full-screen Mapbox):** `src/navigation/screens/record/TrackerLiveScreen.tsx:141-149` for MapboxView mount.

**Screen imports pattern** (from `SettingsScreen.tsx:10-18`):
```typescript
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Icon, useTheme } from '../../../design';
import type { MeStackParamList } from '../../types';
```

**Mapbox host pattern** (from `TrackerLiveScreen.tsx:141-149`):
```typescript
<MapboxView followUserLocation={false}>
  <LocationPuckLayer />
  {/* PHASE1-10: 4× PointAnnotation for corner handles + FillLayer for the picker rectangle */}
</MapboxView>
```
Use `MapboxView` (re-exported from `src/map/index.ts`) — do NOT import `@rnmapbox/maps` directly (ESLint will reject; see `.eslintrc.json:5-15`).

**Header + back-button pattern** (from `SettingsScreen.tsx:72-88`):
```typescript
<View style={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 }}>
  <Pressable onPress={() => nav.goBack()} hitSlop={10}>
    <Icon name="back" size={26} color={t.text} />
  </Pressable>
  <Text style={{ marginTop: 18, fontSize: 30 * t.fontScale, fontWeight: '800', ... }}>
    Выбор области
  </Text>
</View>
```

**Confirm-with-Alert pattern** (from `SettingsScreen.tsx:43-67`):
```typescript
const handleDownload = () => {
  const { tiles, kb } = estimatePackSize(ne, sw);
  if (tiles > 5500) {
    Alert.alert('Слишком большая область', `~${tiles} тайлов превышают лимит iOS`);
    return;
  }
  Alert.alert('Скачать?', `~${(kb / 1024).toFixed(1)} MB, ${tiles} тайлов`, [
    { text: 'Отмена', style: 'cancel' },
    { text: 'Скачать', onPress: () => createCustomPack({ name, ne, sw, onProgress: setProgress }) },
  ]);
};
```

**Route registration**: add to `MeStackParamList` in `src/navigation/types.ts` and wire into the Me stack in `src/navigation/AppTabs.tsx` (alongside `SettingsScreen`).

---

### `src/location/LocationAdapter.ts` (MODIFY — add `setSamplingMode`)

**Analog:** the file itself. Interface extension pattern.

**Interface extension pattern** (insert before closing `}` at line 35):
```typescript
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
JSDoc comments stay Russian to match existing style (file lines 5-34). Export `SamplingMode` type so `ExpoLocationAdapter` and tests can import it.

---

### `src/location/adapters/ExpoLocationAdapter.ts` (MODIFY — implement `setSamplingMode` + iOS gap-resume)

**Analog:** the file itself (lines 50-89). Method addition.

**Method addition pattern** (from RESEARCH.md Pattern 5, lines 393-407):
```typescript
async setSamplingMode(mode: SamplingMode): Promise<void> {
  if (!(await this.isRunning())) return;
  await Location.startLocationUpdatesAsync(TASK_NAME, MODE_OPTIONS[mode]);
}
```

**Mode options table** (place after `TASK_NAME` const at line 8):
```typescript
const MODE_OPTIONS: Record<SamplingMode, Location.LocationTaskOptions> = {
  active: {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: 0,
    timeInterval: 1000,
    showsBackgroundLocationIndicator: true,
    foregroundService: { /* unchanged — copy from existing start() at lines 61-65 */ },
    activityType: Location.ActivityType.Fitness,
  },
  paused: { accuracy: Location.Accuracy.Balanced, distanceInterval: 50, timeInterval: 5000 },
  'background-slc': { accuracy: Location.Accuracy.Lowest, distanceInterval: 500, timeInterval: 0 },
};
```
**Re-use** the existing `foregroundService` block (lines 61-65) for the `active` mode — preserves notification text.

**Error swallow pattern preserved** — existing `start()` doesn't catch (lets caller surface permission issues); `setSamplingMode` should follow the same — let `expo-location` errors bubble up to `SessionManager.pause()`.

---

### `.eslintrc.json` (MODIFY — add token-secret guard)

**Analog:** the file itself. Adds a sibling rule to existing `no-restricted-imports`.

**Rule addition pattern** (insert after the existing `no-restricted-imports` rule at line 15):
```json
{
  "extends": ["expo"],
  "ignorePatterns": ["/dist/*", "node_modules/", "android/", "ios/"],
  "rules": {
    "no-restricted-imports": [ /* unchanged */ ],
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
  },
  "overrides": [ /* unchanged */ ]
}
```
**Pitfall guard**: the `{40,}` length quantifier prevents false-positives on short strings like `'sk-button'` (RESEARCH.md Pitfall 6). Verify by running `npm run lint -- src/__fixtures__/secret.lint-fixture.ts` — must exit non-zero.

---

### `src/__tests__/SessionManager.test.ts` (NEW unit test)

**Analog:** `src/__tests__/pipeline.test.ts:1-60` (pure-class unit test with `makePoint` helper).

**Imports + helper pattern** (from `pipeline.test.ts:1-20`):
```typescript
import { SessionManager } from '../domain/session/SessionManager';
import type { Point, RawPoint } from '../domain/types';
// Mock pipeline + pauseDetector + closureDetector + repo.

function makePoint(opts: Partial<Point> & { ts?: number; lat?: number; lon?: number }): Point {
  return {
    timestamp: opts.ts ?? 0,
    latitude: opts.lat ?? 50,
    longitude: opts.lon ?? 10,
    altitude: null,
    accuracy: opts.accuracy ?? 5,
    speed: null,
    heading: null,
    source: 'raw',
  };
}
```

**Describe / it pattern** (from `pipeline.test.ts:22-36`):
```typescript
describe('SessionManager', () => {
  it('start() transitions idle → recording and creates session row', () => {
    const repo = makeMockRepo();
    const m = new SessionManager(/* deps */, repo, () => {});
    m.start('run');
    expect(repo.createSession).toHaveBeenCalled();
    expect(m.snapshot().state).toBe('recording');
  });
});
```

**Mock-repo pattern** (adapted from `walletStore.test.ts:8-45`):
```typescript
function makeMockRepo(): SessionRepo & { __calls: string[] } {
  const calls: string[] = [];
  return {
    createSession: jest.fn(() => calls.push('createSession')),
    finalizeSession: jest.fn(() => calls.push('finalizeSession')),
    // ...
    __calls: calls,
  };
}
```

---

### `src/__tests__/sessionRepository.integration.test.ts` (NEW integration test)

**Analog:** RESEARCH.md Code Example (lines 603-633) + the mocked-repo pattern in `walletStore.test.ts:8-45` for structure.

**Imports + setup pattern** (RESEARCH.md lines 605-614):
```typescript
import * as SQLite from 'expo-sqlite';
import { createSession, finalizeSession, findActiveSession } from '../storage/sessionRepository';
import { runMigrations, _setDatabase } from '../storage/database';

describe('sessionRepository (real SQLite)', () => {
  beforeEach(() => {
    const db = SQLite.openDatabaseSync(':memory:');
    _setDatabase(db); // requires database.ts to expose test hook
    runMigrations();
  });
  // ...
});
```

**Pre-flight probe** (RESEARCH.md Pitfall 8, line 635): the FIRST test should be a 1-liner probe:
```typescript
it('expo-sqlite loads under jest-expo', () => {
  const db = SQLite.openDatabaseSync(':memory:');
  db.execSync('SELECT 1');
});
```
If it fails, fall back to `better-sqlite3@12.10.0` via a `__mocks__/expo-sqlite.ts` shim. Document outcome in ADR-0005.

**Test cases** (RESEARCH.md lines 616-632): crash-recovery test (create without finalize → `findActiveSession` returns it) + finalize test (`endedAt` set → no longer "active").

**Database.ts refactor required**: expose `_setDatabase(db)` and `runMigrations()` as named exports. Currently `database.ts` uses module-level singleton — add a test-only hook protected by `__DEV__` is acceptable.

---

### `src/__tests__/offline.test.ts` (NEW unit test)

**Analog:** `src/__tests__/pipeline.test.ts:22-60` (function-level unit test, no React).

**Test focus areas:**
1. `estimatePackSize` returns correct tile count for a known 10×10 km bbox at zoom 12-16
2. Bounds-order guard: regression for the `[ne, sw]` vs `[sw, ne]` bug — verify `createCustomPack` is called with `[opts.ne, opts.sw]` order via `jest.mock('@rnmapbox/maps')`
3. Reject when `tiles > 5500` (CONTEXT.md D-23; RESEARCH.md Pitfall 7)

**Mock pattern** for `@rnmapbox/maps` (since the test file lives outside `src/map/`, importing it would also violate ESLint — but the `src/__tests__/` folder is whitelisted by overrides being absent. Use `jest.mock` to intercept):
```typescript
jest.mock('@rnmapbox/maps', () => ({
  offlineManager: {
    createPack: jest.fn(),
    getPacks: jest.fn(() => Promise.resolve([])),
  },
}));
```
*Note for the planner:* add `src/__tests__/**/*` to the eslint `overrides` if the lint rule triggers on test files. Currently it doesn't, since tests use `jest.mock` not literal imports.

---

### `src/__tests__/useClosureFeedback.test.tsx` (and other hook tests — NEW)

**Analog:** None exist — this is the first hook test in the codebase. Use `@testing-library/react-native@13.3.3` `renderHook` (already installed; RESEARCH.md line 99 confirms).

**Imports pattern** (greenfield — choose canonical):
```typescript
import { renderHook, act } from '@testing-library/react-native';
import { useClosureFeedback } from '../navigation/screens/record/hooks/useClosureFeedback';
import { useActivityStore } from '../state/activity';
```

**Mock pattern for `expo-haptics`** (the module won't load under Jest without a mock):
```typescript
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success' },
}));
```

**Toast mock pattern** (mock the `useToast` hook):
```typescript
const showMock = jest.fn();
jest.mock('../ui/Toast', () => ({
  useToast: () => ({ show: showMock }),
  ToastProvider: ({ children }: any) => children,
}));
```

**Test cases:**
1. Hook calls `Haptics.notificationAsync` once when `closureFired` flips false→true
2. Hook calls `show('Зона замкнута! Площадь: ...')` with formatted area
3. Hook does NOT call haptic on re-render with same `closureFired=true` (idempotent in effect-deps)

---

### `src/__tests__/ExpoLocationAdapter.test.ts` (NEW)

**Analog:** `src/__tests__/realtimeAdapter.test.ts` (existing adapter test — pattern for mocking native module + asserting behavior).

**Mock expo-location pattern:**
```typescript
const startLocationUpdates = jest.fn();
const hasStarted = jest.fn(() => Promise.resolve(true));
jest.mock('expo-location', () => ({
  startLocationUpdatesAsync: (...args: unknown[]) => startLocationUpdates(...args),
  hasStartedLocationUpdatesAsync: () => hasStarted(),
  stopLocationUpdatesAsync: jest.fn(),
  Accuracy: { BestForNavigation: 6, Balanced: 3, Lowest: 1 },
  ActivityType: { Fitness: 3 },
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
```

**Test cases:**
1. `setSamplingMode('paused')` calls `startLocationUpdatesAsync(TASK_NAME, { accuracy: Balanced, distanceInterval: 50 })`
2. `setSamplingMode('background-slc')` uses `Accuracy.Lowest + distanceInterval: 500`
3. `setSamplingMode('active')` restores `BestForNavigation + timeInterval: 1000`
4. `setSamplingMode` is a no-op when adapter not running

---

### `src/__fixtures__/secret.lint-fixture.ts` (NEW)

**Analog:** None — first fixture file. Greenfield pattern.

**Pattern (RESEARCH.md Validation Architecture, line 734):** a file containing the negative pattern; CI verifies `npm run lint -- src/__fixtures__/secret.lint-fixture.ts` exits with non-zero:
```typescript
// Intentional lint-failure fixture for PHASE1-13 token-secret guard.
// CI verifies that running ESLint on this file exits non-zero.

const leakedSecret = process.env.EXPO_PUBLIC_MAPBOX_SECRET; // ← should trigger no-restricted-syntax
const hardCoded = 'sk.eyJ1IjoiZmFrZSIsImEiOiJja3FxcWFhYWEwMDFhMm9wbHBpZXh4eHh4eHgifQ.fake-suffix-for-fixture';
export { leakedSecret, hardCoded };
```

**`.eslintignore` update**: add `src/__fixtures__/` so this fixture does NOT block `npm run lint` of the rest of the codebase; only the explicit `lint -- src/__fixtures__/secret.lint-fixture.ts` invocation should target it.

---

### `docs/DECISIONS/0005-phase-1-field-test-outcomes.md` (NEW ADR)

**Analog:** `docs/DECISIONS/0004-feed-backend-cleanup.md` (latest existing ADR) — match structure.

**ADR template pattern** — keep the same headings as existing ADRs (Title, Status, Context, Decision, Consequences). Write in Russian to match existing ADRs and CLAUDE.md guidance. Reference PHASE1-01..04 test results inline.

---

### `docs/SECRETS.md` (MOD or NEW — rotation playbook)

**Analog:** `docs/INTEGRATIONS.md` (existing integration spec) — match heading depth + Russian narrative style.

**Required sections** (per CONTEXT.md D-32):
1. Token inventory (`EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` public pk; `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` build-time sk)
2. Rotation playbook (4 steps from D-32)
3. Storage rules (`.netrc` mode 600, `gradle.properties` outside repo)
4. ESLint-guard reference (PHASE1-13)
5. Incident response — what to do if leak detected

---

### `STATUS.md` and `docs/DEVELOPMENT_PLAN.md` (MOD — closure)

**Analog:** existing entries in `STATUS.md` Phase 1 progress table (per CONTEXT.md anchor at line 132). Append closure rows; mark PHASE1-* ✓; cross-link field-test results in `tests/FIELD_PROTOCOL.md` and ADR-0005.

---

## Shared Patterns

### Logging (apply to all new/modified files)

**Source:** CONVENTIONS.md §Logging + `src/state/activity.ts` (numerous examples)
**Apply to:** All new files that emit log lines (`SessionManager`, `useClosureFeedback`, `RegionPickerScreen`, `offline.ts` extensions)

**Pattern:**
```typescript
console.warn('[scope] message', err);   // recoverable
console.error('[scope] description', err);  // unrecoverable
// __DEV__ guard for verbose:
if (__DEV__) console.log('[pipeline] dropped by ${event.filterName}');
```
**Scope tags** (lowercase, hyphenated): `[session]`, `[offline]`, `[closure]`, `[gap-resume]`, `[location]`, `[Tracker]` (note `Tracker` PascalCase exception is used in existing `TrackerLiveScreen.tsx:118`). Match the surrounding file when modifying.

---

### Error handling (apply to all new/modified files)

**Source:** CONVENTIONS.md §Error Handling + `src/state/auth.ts:101` + `src/state/activity.ts:194-198, 225-302`
**Apply to:** `SessionManager`, `offline.ts`, store delegations

**Three-tier pattern:**
1. **Domain (`SessionManager`)** — never throw out of methods called from event callbacks; catch and log.
2. **Repository / adapter** — typed errors only when caller can recover (e.g., `InsufficientBalanceError`). For `setSamplingMode` failures: let them bubble; caller decides.
3. **Store / hook (Zustand action / `useClosureFeedback`)** — try/catch + `console.warn('[scope] ...', e)`; never throw out of an action. UI reads `error: string | null` from store.

**Async-effect pattern** (mandatory for `Haptics.notificationAsync` and similar):
```typescript
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  .catch(() => { /* best-effort feedback — swallow */ });
```

---

### Module-header comments (apply to NEW domain / adapter files)

**Source:** CONVENTIONS.md §Comments + `src/domain/ClosureDetector.ts:1-3` + `src/domain/walletDomain.ts:1-3`
**Apply to:** `SessionManager.ts`, `Toast.tsx`, new hooks, `RegionPickerScreen.tsx`, `useClosureFeedback.ts`

**Mandatory header**: 2-3 lines stating purpose + Phase/REQ-ID + ТЗ section reference. Russian or mixed — match the file area's existing style.

Example template:
```typescript
// <Capability name>: <one-line purpose>.
// Phase 1 / PHASE1-XX. См. ТЗ §<section>, докcm/DEVELOPMENT_PLAN.md §3.
// <Any layering / dependency rule that matters>.
```

---

### Adapter discipline (apply to map / location work)

**Source:** CLAUDE.md `Что НЕ делать никогда` + `.eslintrc.json:5-15` + STRUCTURE.md
**Apply to:** `RegionPickerScreen.tsx`, `offline.ts`, all map-touching tests

**Rules:**
1. `@rnmapbox/maps` import is ALLOWED ONLY in `src/map/**` (ESLint-enforced via `no-restricted-imports`).
2. All external map use goes through `MapboxView`, `TrackLayer`, `ZoneLayer`, etc., re-exported from `src/map/index.ts`.
3. New offline operations live in `src/map/offline.ts` (NOT in the screen file).
4. Screen calls into `offline.ts`; passes user-picked corners; never touches `offlineManager` directly.

---

### Naming + units (apply everywhere)

**Source:** CONVENTIONS.md §Naming Patterns
**Apply to:** All new variables, types, files

- Files: PascalCase for single-class / component (`SessionManager.ts`, `Toast.tsx`, `RegionPickerScreen.tsx`, `Use*` hooks: `useTrackerCamera.ts` keep lower-camel since it's a function-export)
- Variables: camelCase with unit suffix (`distanceM`, `areaM2`, `durationS`, `gpsGapTriggerS`)
- Booleans: positive predicate (`closureFired`, `isPaused`, `isClosed`)
- Constants: SCREAMING_SNAKE for module-level (`SIMPLIFY_THRESHOLD_PTS`, `BASE_TOLERANCE_DEG`, `MODE_OPTIONS`, `HOME_PACK_NAME`)
- String-literal unions for enums (`SamplingMode = 'active' | 'paused' | 'background-slc'`)

---

### Imports (apply everywhere)

**Source:** CONVENTIONS.md §Import Organization
**Apply to:** All new TS/TSX files

```typescript
// 1. External packages (React, RN, zustand, expo-*, @rnmapbox)
import { useEffect } from 'react';
import { Animated, View } from 'react-native';
import * as Haptics from 'expo-haptics';

// 2. Blank line.

// 3. Internal RELATIVE imports (no path aliases), grouped roughly by layer:
//    domain → util → storage → state → ui
import type { Point } from '../domain/types';
import { totalDistance } from '../util/geo';
import { useActivityStore } from '../state/activity';
import { formatArea } from '../ui/format';
```
**No default exports** (CONVENTIONS.md §Module Design). **No path aliases** (`@/*` set up but unused).

---

### Functional `set` for race-safety (apply to store mutations)

**Source:** CONVENTIONS.md §State Management + `src/state/activity.ts:443-456` + STATUS.md R7 fix
**Apply to:** Any new Zustand action that reads + writes overlapping state; SessionManager's internal mutations that read existing `points`/`laps`

```typescript
set((s) => {
  if (s.state !== 'recording') return s;
  // compute from s
  return { points: [...s.points, point], bufferedCount: buffer.length };
});
```
**Critical** for `acceptPoint` and `markLap` — these are concurrent with the per-second tick and per-point pipeline emits.

---

### Pure-domain layering (apply to SessionManager + future modules)

**Source:** CLAUDE.md §Структура папок + CONVENTIONS.md §Pure-domain Jest tests
**Apply to:** `src/domain/session/SessionManager.ts`

**Forbidden imports inside `SessionManager.ts`:**
- `@rnmapbox/maps` (ESLint enforced)
- `expo-sqlite`, `expo-location`, `expo-haptics` (pure domain)
- `zustand`, `react` (pure domain)
- `../storage/*` directly — use the injected `SessionRepo` interface
- `../state/*` — domain doesn't know about stores

**Allowed imports:**
- `../types` (or `./types`)
- `../../util/geo`, `../../util/*` (pure helpers only)
- `../calories`, `../records`, `../lap`, `../AreaCalculator`, `../ClosureDetector` (pure-domain peers)
- `../../pipeline/*` (peer pure subsystem — confirmed pure in `src/pipeline/Pipeline.ts`)

This keeps `SessionManager.test.ts` Jest-runnable without `jest-expo` native-module shims.

---

## No Analog Found

Files with no close analog in the codebase (planner uses RESEARCH.md patterns / greenfield decisions):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/navigation/screens/record/hooks/use*.ts` (camera, layers, pause) | react hook | request-response | First custom hooks in codebase — `@testing-library/react-native` installed but never used. RESEARCH.md Pattern 1 + selector idiom from TrackerLiveScreen serve as template. |
| `src/__tests__/use*.test.tsx` | hook test | — | No prior hook tests — first user of `renderHook`. RESEARCH.md Validation Architecture defines the convention. |
| `src/__fixtures__/secret.lint-fixture.ts` | lint negative fixture | — | No prior `__fixtures__/` directory. New convention. |

These are the only true greenfield additions; everything else copies from an existing file in `apps/mobile-rn/src/`.

## Metadata

**Analog search scope:**
- `apps/mobile-rn/src/domain/` (pure domain class patterns)
- `apps/mobile-rn/src/state/` (Zustand store patterns)
- `apps/mobile-rn/src/modules/gamification/` and `moderation/` (modular layout)
- `apps/mobile-rn/src/location/` (adapter interface + impl)
- `apps/mobile-rn/src/map/` (offline + MapboxView)
- `apps/mobile-rn/src/navigation/screens/` (screen scaffolds)
- `apps/mobile-rn/src/ui/` (modal + format helpers)
- `apps/mobile-rn/src/__tests__/` (existing test patterns)
- `apps/mobile-rn/.eslintrc.json` (lint rule pattern)
- `apps/mobile-rn/App.tsx` (provider mounting)
- `docs/DECISIONS/` (ADR template)

**Files scanned:** ~25 (representative, not exhaustive — RESEARCH.md already exhaustively mapped the file list)

**Pattern extraction date:** 2026-05-14

---

*Phase: 1-Validate-Close-Territory-Core*
*Pattern map: 2026-05-14*
