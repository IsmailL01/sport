// RunDetailsScreen — snapshot regression test (Phase 1 / PHASE1-09).
//
// Покрывает D-20 + D-21 + D-22 (CONTEXT.md):
//   D-20 — Summary screen already implemented; lock visual contract в snapshot
//   D-21 — branch `closureFired && areaM2 !== null` рендерит ПЛОЩАДЬ tile +
//          ZoneLayer (closed polygon mapping)
//   D-22 — GPX share button присутствует (текст "Экспорт GPX")
//
// Это первый full-screen render-test в codebase. Устанавливает образец для
// будущих snapshot-тестов (Plans 06/07 — RegionPickerScreen etc.).
//
// Mock-pattern: Zustand-mock-pattern из Plan 02 SUMMARY (module-level mockState
// + getState возвращающий тот же mockState). Mock-имена ОБЯЗАНЫ начинаться с
// `mock` для прохода через Jest hoist-guard.
//
// Stability: `Date.prototype.toLocaleString` зависит от TZ хоста (Node читает
// TZ при старте, не lazy — `process.env.TZ = ...` внутри теста уже поздно).
// Подменяем toLocaleString на детерминированный stub — snapshot стабилен
// независимо от TZ CI / dev-машины.
const originalToLocaleString = Date.prototype.toLocaleString;
Date.prototype.toLocaleString = function (this: Date, _locale?: string | string[]): string {
  // ISO с заменой 'T' на ', ' — UTC-стабильно, не зависит от хост-TZ.
  return this.toISOString().replace('T', ', ').replace(/\.\d{3}Z$/, ' (UTC)');
};

import { render } from '@testing-library/react-native';

// ── jest.mock factories (hoisted above imports by Babel) ─────────────────────

const mockGoBack: jest.Mock = jest.fn();
const mockPopToTop: jest.Mock = jest.fn();
const mockNavReplace: jest.Mock = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    popToTop: mockPopToTop,
    replace: mockNavReplace,
  }),
  useRoute: () => ({ params: { sessionId: '1' } }),
}));

// Map components — стабим к inert. Дети передаются как children → ничего не
// рендерится визуально, но dom-tree корректный.
jest.mock('../map', () => ({
  HistoryTerritoryLayer: () => null,
  LocationPuckLayer: () => null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  MapboxView: ({ children }: any) => children ?? null,
  TrackLayer: () => null,
  ZoneLayer: () => null,
}));

// Design barrel — реальный импортирует MMKV. Стабим useTheme + Button + Card +
// Icon. Button рендерит свой children — это критично для getByText('Экспорт GPX').
jest.mock('../design', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const { Pressable, Text, View } = require('react-native');
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Button: ({ children, onPress }: any) =>
      React.createElement(
        Pressable,
        { onPress, testID: 'button-stub' },
        React.createElement(Text, null, children),
      ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Card: ({ children, style }: any) =>
      React.createElement(View, { style, testID: 'card-stub' }, children),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Icon: ({ name }: any) => React.createElement(Text, { testID: `icon-${name}` }, ''),
    useTheme: () => ({
      bg: '#0A0A0A',
      surface: '#161616',
      surface3: '#2A2A2A',
      divider: 'rgba(255,255,255,0.06)',
      text: '#FFFFFF',
      text2: '#9A9A9A',
      text3: '#5E5E5E',
      lime: '#C6F560',
      error: '#FF3B30',
      warn: '#FFB020',
      font: 'system',
      fontDisplay: 'system',
      fontScale: 1,
    }),
  };
});

// gpx serialize — не нужен в render (handleExport вызывается из кнопки).
jest.mock('../domain/gpx', () => ({
  serializeToGpx: jest.fn(() => '<gpx></gpx>'),
}));

// ── Zustand-mock-pattern (replicate verbatim from Plan 02 SUMMARY) ───────────

type MockPoint = {
  timestamp: number;
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  source: 'raw';
};

type MockLap = {
  lapNumber: number;
  durationS: number;
  distanceM: number;
  paceMinKm: number | null;
};

type MockSession = {
  id: number;
  startedAt: number;
  endedAt: number | null;
  isClosed: boolean | null;
  distanceM: number | null;
  areaM2: number | null;
  avgHrBpm: number | null;
  maxHrBpm: number | null;
  caloriesKcal: number | null;
  activityType: 'run';
  calcMethod: 'shoelace_simple' | null;
  note: string | null;
};

type MockActivityState = {
  points: MockPoint[];
  areaM2: number | null;
  closureFired: boolean;
  lastNewRecords: Array<{ kind: string; value: number }>;
  laps: MockLap[];
  reset: jest.Mock;
  acknowledgeNewRecords: jest.Mock;
};

const mockActivity: MockActivityState = {
  points: [],
  areaM2: null,
  closureFired: false,
  lastNewRecords: [],
  laps: [],
  reset: jest.fn(),
  acknowledgeNewRecords: jest.fn(),
};

const mockHistory = {
  sessions: [] as MockSession[],
  closedSessionsPoints: new Map<number, MockPoint[]>(),
  refresh: jest.fn(),
  delete: jest.fn(),
};

const mockWallet = {
  transactions: [] as Array<{
    sourceSessionId: number;
    kind: 'earn' | 'spend';
    amount: number;
    meta: { capped: boolean } | null;
  }>,
};

function makePoints(count: number): MockPoint[] {
  // Детерминированные fake-точки: timestamp монотонный, lat/lon фиксированный
  // дельта-шаг. НЕТ Date.now() — snapshot обязан быть стабильным между
  // запусками.
  return Array.from({ length: count }, (_, i) => ({
    timestamp: 1_700_000_000_000 + i * 5_000,
    latitude: 50.0 + i * 0.0001,
    longitude: 10.0 + i * 0.0001,
    accuracy: 5,
    altitude: null,
    speed: null,
    heading: null,
    source: 'raw' as const,
  }));
}

const CLOSED_SESSION: MockSession = {
  id: 1,
  startedAt: 1_700_000_000_000,
  endedAt: 1_700_000_300_000, // +5min
  isClosed: true,
  distanceM: 5000,
  areaM2: 50_000,
  avgHrBpm: 140,
  maxHrBpm: 165,
  caloriesKcal: 350,
  activityType: 'run',
  calcMethod: 'shoelace_simple',
  note: null,
};

const OPEN_SESSION: MockSession = {
  ...CLOSED_SESSION,
  isClosed: false,
  areaM2: null,
  calcMethod: null,
};

function setClosedScenario() {
  mockActivity.points = makePoints(50);
  mockActivity.areaM2 = 50_000;
  mockActivity.closureFired = true;
  mockActivity.lastNewRecords = [];
  mockActivity.laps = [
    { lapNumber: 1, durationS: 300, distanceM: 1000, paceMinKm: 5.0 },
    { lapNumber: 2, durationS: 310, distanceM: 1000, paceMinKm: 5.17 },
  ];
  mockHistory.sessions = [CLOSED_SESSION];
}

function setOpenScenario() {
  mockActivity.points = makePoints(30);
  mockActivity.areaM2 = null;
  mockActivity.closureFired = false;
  mockActivity.lastNewRecords = [];
  mockActivity.laps = [];
  mockHistory.sessions = [OPEN_SESSION];
}

function resetMocks() {
  mockActivity.points = [];
  mockActivity.areaM2 = null;
  mockActivity.closureFired = false;
  mockActivity.lastNewRecords = [];
  mockActivity.laps = [];
  mockActivity.reset = jest.fn();
  mockActivity.acknowledgeNewRecords = jest.fn();
  mockHistory.sessions = [];
  mockHistory.closedSessionsPoints = new Map();
  mockHistory.refresh = jest.fn();
  mockHistory.delete = jest.fn();
  mockWallet.transactions = [];
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
    <T,>(selector: (s: any) => T): T => selector(mockHistory),
    { getState: () => mockHistory },
  ),
}));

jest.mock('../state/wallet', () => ({
  useWalletStore: Object.assign(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <T,>(selector: (s: any) => T): T => selector(mockWallet),
    { getState: () => mockWallet },
  ),
}));

// Тестируемое — импорт ПОСЛЕ jest.mock.
import { RunDetailsScreen } from '../navigation/screens/record/RunDetailsScreen';

beforeEach(() => {
  resetMocks();
  mockGoBack.mockClear();
  mockPopToTop.mockClear();
  mockNavReplace.mockClear();
});

afterAll(() => {
  // Восстанавливаем оригинальный Date.prototype.toLocaleString — чтобы наши
  // testfile-level mocks не утекли в соседние test-suites (jest worker может
  // переиспользовать процесс).
  Date.prototype.toLocaleString = originalToLocaleString;
});

describe('RunDetailsScreen — snapshot regression (PHASE1-09)', () => {
  it('renders closed-zone summary with area tile, splits, and GPX share button (D-21 + D-22)', () => {
    setClosedScenario();

    const { toJSON, getByText } = render(<RunDetailsScreen />);

    // D-22: GPX share button присутствует (текст "Экспорт GPX").
    expect(getByText(/Экспорт GPX/i)).toBeTruthy();

    // D-21: ПЛОЩАДЬ tile рендерится (closureFired && areaM2 !== null).
    expect(getByText(/ПЛОЩАДЬ/i)).toBeTruthy();

    // Splits / laps rendered (Круги header).
    expect(getByText(/Круги/i)).toBeTruthy();

    // Метрики headers — distance / time / pace / pulse / calories.
    expect(getByText(/ДИСТАНЦИЯ/i)).toBeTruthy();
    expect(getByText(/ВРЕМЯ/i)).toBeTruthy();
    expect(getByText(/ТЕМП/i)).toBeTruthy();
    expect(getByText(/ПУЛЬС/i)).toBeTruthy();
    expect(getByText(/КАЛОРИИ/i)).toBeTruthy();

    // Snapshot: locks the whole render tree (lap rows + actions + map host).
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders open (non-closure) summary without area tile but with GPX button (D-22)', () => {
    setOpenScenario();

    const { toJSON, queryByText, getByText } = render(<RunDetailsScreen />);

    // GPX share button присутствует независимо от closure (D-22).
    expect(getByText(/Экспорт GPX/i)).toBeTruthy();

    // ПЛОЩАДЬ tile НЕ должен присутствовать — closureFired === false.
    expect(queryByText(/ПЛОЩАДЬ/i)).toBeNull();

    // Круги не рендерятся при laps.length === 0.
    expect(queryByText(/Круги/i)).toBeNull();

    // Snapshot открытой сессии — separate snapshot file entry.
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders loading placeholder when session not found (defensive)', () => {
    // session === undefined → screen возвращает "Загружаем сессию…".
    mockHistory.sessions = []; // pусто — sessionId=1 not found.

    const { getByText, queryByText } = render(<RunDetailsScreen />);

    expect(getByText(/Загружаем сессию/i)).toBeTruthy();
    // Нет кнопки экспорта, пока сессия не загрузилась.
    expect(queryByText(/Экспорт GPX/i)).toBeNull();
  });
});
