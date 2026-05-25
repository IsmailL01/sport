// TrackerLiveScreen — navigation assertion test (Phase 1 / PHASE1-09).
//
// Покрывает D-20 (CONTEXT.md): после подтверждения "Сохранить" в Stop-Alert
// экран обязан вызвать `nav.replace('RunDetails', { sessionId })` — НЕ
// `nav.navigate` и не `nav.push` (иначе кнопка "Назад" вернёт юзера на
// stopped recording screen — undefined UX).
//
// Scope: только проверка вызова навигации. Mapbox / store / location adapter
// мокаются — это не render-test всего экрана.
//
// Mock-pattern: Zustand-mock-pattern из Plan 02's SUMMARY (module-level
// mockState + getState возвращающий тот же mockState) — replicate verbatim.
// ВАЖНО: Jest hoists `jest.mock` ABOVE all `const` — variable names ОБЯЗАНЫ
// начинаться с префикса `mock` (case insensitive), иначе ReferenceError.

import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

// ── jest.mock factories (hoisted to top by Babel before imports) ─────────────
// Имена с `mock`-префиксом — Jest разрешает их использование внутри factories
// (см. ExpoLocationAdapter.test.ts:8-9 для аналогичного паттерна).

const mockReplace: jest.Mock = jest.fn();
const mockNavigate: jest.Mock = jest.fn();
const mockPush: jest.Mock = jest.fn();
const mockGoBack: jest.Mock = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    replace: mockReplace,
    navigate: mockNavigate,
    push: mockPush,
    goBack: mockGoBack,
  }),
  useRoute: () => ({ params: {} }),
}));

// Map / location / health / sync — heavy native deps. Stub to inert.
jest.mock('../map', () => ({
  CorridorLayer: () => null,
  HistoryTerritoryLayer: () => null,
  LocationPuckLayer: () => null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  MapboxView: ({ children }: any) => children ?? null,
  TrackLayer: () => null,
  ZoneLayer: () => null,
}));

jest.mock('../location', () => ({
  locationAdapter: {
    stop: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../health/sync', () => ({
  writeSessionToHealth: jest.fn(() => Promise.resolve()),
}));

// Design barrel: реальный barrel импортирует ThemeProvider → MMKV (native).
// Стабим useTheme минимальным набором токенов, которые читает экран.
jest.mock('../design', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Icon: (_props: any) => null,
  useTheme: () => ({
    bg: '#0A0A0A',
    surface: '#161616',
    text: '#FFFFFF',
    text2: '#9A9A9A',
    text3: '#5E5E5E',
    error: '#FF3B30',
    warn: '#FFB020',
    lime: '#C6F560',
    font: 'system',
    fontDisplay: 'system',
    fontScale: 1,
  }),
}));

// Hooks (внутренние screen-hooks) — стабим, чтобы не тянуть activity-store
// через них (они дёргают свой useActivityStore-mock).
jest.mock('../navigation/screens/record/hooks/useTrackerCamera', () => ({
  useTrackerCamera: () => ({ cameraProps: { followUserLocation: true, followZoomLevel: 16 } }),
}));
jest.mock('../navigation/screens/record/hooks/useLayerVisibility', () => ({
  useLayerVisibility: () => ({
    showTrack: false,
    showCorridor: false,
    showZone: false,
    dimOverlay: false,
  }),
}));
jest.mock('../navigation/screens/record/hooks/usePauseUI', () => ({
  usePauseUI: () => ({ isPaused: false, pauseLabel: 'Пауза', toggle: jest.fn() }),
}));
jest.mock('../navigation/screens/record/hooks/useClosureFeedback', () => ({
  useClosureFeedback: () => undefined,
}));

// ── Zustand-mock-pattern (replicate verbatim from Plan 02 SUMMARY) ───────────
// Module-level state объект; имя ДОЛЖНО начинаться с `mock` для hoist-guard.

type MockActivityState = {
  state: 'idle' | 'recording' | 'stopped';
  points: Array<{ timestamp: number; latitude: number; longitude: number; accuracy: number; altitude: number | null; speed: number | null; heading: number | null; source: 'raw' }>;
  startedAt: number | null;
  endedAt: number | null;
  sessionId: number | null;
  isPaused: boolean;
  closureFired: boolean;
  areaM2: number | null;
  laps: Array<{ lapNumber: number; durationS: number; distanceM: number; paceMinKm: number | null }>;
  stop: jest.Mock;
  reset: jest.Mock;
  markLap: jest.Mock;
};

const mockActivity: MockActivityState = {
  state: 'recording',
  points: [],
  startedAt: 1_700_000_000_000,
  endedAt: 1_700_000_300_000,
  sessionId: 12345,
  isPaused: false,
  closureFired: false,
  areaM2: null,
  laps: [],
  stop: jest.fn(),
  reset: jest.fn(),
  markLap: jest.fn(),
};

function resetMockActivity() {
  mockActivity.state = 'recording';
  mockActivity.points = [
    { timestamp: 1_700_000_000_000, latitude: 50.0, longitude: 10.0, accuracy: 5, altitude: null, speed: null, heading: null, source: 'raw' },
    { timestamp: 1_700_000_010_000, latitude: 50.0001, longitude: 10.0001, accuracy: 5, altitude: null, speed: null, heading: null, source: 'raw' },
  ];
  mockActivity.startedAt = 1_700_000_000_000;
  mockActivity.endedAt = 1_700_000_300_000;
  mockActivity.sessionId = 12345;
  mockActivity.isPaused = false;
  mockActivity.closureFired = false;
  mockActivity.areaM2 = null;
  mockActivity.laps = [];
  mockActivity.stop = jest.fn();
  mockActivity.reset = jest.fn();
  mockActivity.markLap = jest.fn();
}

jest.mock('../state/activity', () => ({
  useActivityStore: Object.assign(
    <T,>(selector: (s: MockActivityState) => T): T => selector(mockActivity),
    { getState: () => mockActivity },
  ),
  ingestRawPoint: jest.fn(),
}));

jest.mock('../state/history', () => ({
  useHistoryStore: Object.assign(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (selector: any) => selector({ closedSessionsPoints: new Map(), sessions: [] }),
    { getState: () => ({ closedSessionsPoints: new Map(), sessions: [] }) },
  ),
}));

jest.mock('../state/sensors', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useSensorsStore: (selector: any) => selector({ liveHrBpm: null }),
}));

jest.mock('../state/sync', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useSyncStore: (selector: any) => selector({ trigger: jest.fn(() => Promise.resolve()) }),
}));

// Тестируемое (импорт ПОСЛЕ jest.mock).
import { TrackerLiveScreen } from '../navigation/screens/record/TrackerLiveScreen';

beforeEach(() => {
  resetMockActivity();
  mockReplace.mockClear();
  mockNavigate.mockClear();
  mockPush.mockClear();
  mockGoBack.mockClear();
});

describe('TrackerLiveScreen — Stop+Save navigation (PHASE1-09 / D-20)', () => {
  it('calls nav.replace("RunDetails", { sessionId }) when user confirms "Сохранить"', async () => {
    // Перехватываем Alert.alert и сразу вызываем callback кнопки "Сохранить".
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_title: any, _msg: any, buttons: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const save = buttons?.find((b: any) => /Сохранить/i.test(b?.text ?? ''));
        save?.onPress?.();
      },
    );

    const { getByTestId } = render(<TrackerLiveScreen />);
    fireEvent.press(getByTestId('tracker-stop-button'));

    // Stop+Save flow вызывает locationAdapter.stop().then(...) — даём
    // микротаскам прокрутиться (двойной drain — promise chain).
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('RunDetails', { sessionId: '12345' });

    alertSpy.mockRestore();
  });

  it('never calls nav.navigate or nav.push from the Stop+Save path', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_title: any, _msg: any, buttons: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const save = buttons?.find((b: any) => /Сохранить/i.test(b?.text ?? ''));
        save?.onPress?.();
      },
    );

    const { getByTestId } = render(<TrackerLiveScreen />);
    fireEvent.press(getByTestId('tracker-stop-button'));

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('empty-session guard: durationS=0 + no points → "Пустая сессия" Alert + goBack on delete (never nav.replace)', async () => {
    // 2026-05-25 (tracker-live-polish-pass item 7): empty-session guard
    // intercepts STOP before reaching the Save/Delete dialog. The previous
    // assertion (Save path falls through to goBack when sessionId null) is
    // superseded: the new guard prevents that broken path from ever firing.
    // Test now validates the new "Пустая сессия" Alert flow.
    mockActivity.sessionId = null;
    mockActivity.startedAt = null;
    mockActivity.endedAt = null;

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (title: any, _msg: any, buttons: any) => {
        // Empty-session dialog title is "Пустая сессия"; pick "Удалить и выйти".
        expect(String(title)).toMatch(/Пустая сессия/);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const del = buttons?.find((b: any) =>
          /Удалить и выйти/i.test(b?.text ?? ''),
        );
        del?.onPress?.();
      },
    );

    const { getByTestId } = render(<TrackerLiveScreen />);
    fireEvent.press(getByTestId('tracker-stop-button'));

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockGoBack).toHaveBeenCalled();

    alertSpy.mockRestore();
  });
});
