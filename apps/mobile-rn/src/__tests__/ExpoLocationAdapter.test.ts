// ExpoLocationAdapter — unit tests (Phase 1 / PHASE1-11 / Task 1).
// Покрытие: mapping `SamplingMode → Location.LocationTaskOptions`, идемпотентность
// `setSamplingMode` (no-op когда таск не запущен, replace-in-place без stop/start).
//
// Mock-паттерн для expo-location: jest.fn() с фиксированным `hasStarted`
// возвращающим `true`. Тест #4 переопределяет mock через `mockReturnValueOnce(false)`.

// Variable names prefixed with `mock` are allowed inside jest.mock() factories
// (Jest hoists jest.mock to the top of the file before imports).
const mockStartLocationUpdates: jest.Mock = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockStopLocationUpdates: jest.Mock = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockHasStarted: jest.Mock = jest.fn((_name?: string) => Promise.resolve(true));

jest.mock('expo-location', () => ({
  startLocationUpdatesAsync: (...args: unknown[]) => mockStartLocationUpdates(...args),
  stopLocationUpdatesAsync: (...args: unknown[]) => mockStopLocationUpdates(...args),
  hasStartedLocationUpdatesAsync: (name?: string) => mockHasStarted(name),
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestBackgroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  Accuracy: {
    Lowest: 1,
    Low: 2,
    Balanced: 3,
    High: 4,
    Highest: 5,
    BestForNavigation: 6,
  },
  ActivityType: {
    Other: 1,
    AutomotiveNavigation: 2,
    Fitness: 3,
    OtherNavigation: 4,
    Airborne: 5,
  },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
}));

// Mock activity ingestRawPoint (defineTask is a no-op above, but the module imports
// state/activity which transitively imports SQLite + other heavy modules). Stub it
// to a no-op to keep the adapter unit-test isolated.
jest.mock('../state/activity', () => ({
  ingestRawPoint: jest.fn(),
}));

import { ExpoLocationAdapter } from '../location/adapters/ExpoLocationAdapter';

const TASK_NAME = 'BACKGROUND_LOCATION_TASK';

describe('ExpoLocationAdapter.setSamplingMode', () => {
  beforeEach(() => {
    mockStartLocationUpdates.mockClear();
    mockStopLocationUpdates.mockClear();
    mockHasStarted.mockReset();
    mockHasStarted.mockImplementation(() => Promise.resolve(true));
  });

  it("setSamplingMode('active') passes BestForNavigation + timeInterval 1000 + Fitness activityType", async () => {
    const a = new ExpoLocationAdapter();
    await a.setSamplingMode('active');

    expect(mockStartLocationUpdates).toHaveBeenCalledTimes(1);
    const [taskName, opts] = mockStartLocationUpdates.mock.calls[0] as [string, Record<string, unknown>];
    expect(taskName).toBe(TASK_NAME);
    expect(opts.accuracy).toBe(6); // BestForNavigation
    expect(opts.timeInterval).toBe(1000);
    expect(opts.distanceInterval).toBe(0);
    expect(opts.activityType).toBe(3); // Fitness
    expect(opts.showsBackgroundLocationIndicator).toBe(true);
    // foregroundService present (Android)
    expect(opts.foregroundService).toBeDefined();
    const fg = opts.foregroundService as Record<string, unknown>;
    expect(fg.notificationTitle).toBe('Запись пробежки');
    expect(fg.notificationColor).toBe('#10B981');
  });

  it("setSamplingMode('paused') passes Balanced + distanceInterval 50 + timeInterval 5000", async () => {
    const a = new ExpoLocationAdapter();
    await a.setSamplingMode('paused');

    expect(mockStartLocationUpdates).toHaveBeenCalledTimes(1);
    const [, opts] = mockStartLocationUpdates.mock.calls[0] as [string, Record<string, unknown>];
    expect(opts.accuracy).toBe(3); // Balanced
    expect(opts.distanceInterval).toBe(50);
    expect(opts.timeInterval).toBe(5000);
    // foregroundService still present (notification stays — battery saver during pauses)
    expect(opts.foregroundService).toBeDefined();
  });

  it("setSamplingMode('background-slc') passes Accuracy.Lowest + distanceInterval 500 + no foregroundService", async () => {
    const a = new ExpoLocationAdapter();
    await a.setSamplingMode('background-slc');

    expect(mockStartLocationUpdates).toHaveBeenCalledTimes(1);
    const [, opts] = mockStartLocationUpdates.mock.calls[0] as [string, Record<string, unknown>];
    expect(opts.accuracy).toBe(1); // Lowest — iOS SLC approximation
    expect(opts.distanceInterval).toBe(500);
    expect(opts.timeInterval).toBe(0);
    expect(opts.foregroundService).toBeUndefined();
  });

  it('setSamplingMode is a no-op when adapter is NOT running (hasStarted=false)', async () => {
    mockHasStarted.mockImplementationOnce(() => Promise.resolve(false));
    const a = new ExpoLocationAdapter();

    await a.setSamplingMode('paused');

    expect(mockStartLocationUpdates).not.toHaveBeenCalled();
  });

  it('setSamplingMode does NOT call stopLocationUpdatesAsync (replace-in-place, RESEARCH.md §A5)', async () => {
    const a = new ExpoLocationAdapter();
    await a.setSamplingMode('paused');
    await a.setSamplingMode('active');

    // Both calls should reconfigure via startLocationUpdatesAsync,
    // NEVER via stop+start (would add 1-2s gap per RESEARCH.md §A5).
    expect(mockStopLocationUpdates).not.toHaveBeenCalled();
    expect(mockStartLocationUpdates).toHaveBeenCalledTimes(2);
  });

  it('repeated setSamplingMode calls — last one wins (idempotent replace)', async () => {
    const a = new ExpoLocationAdapter();
    await a.setSamplingMode('paused');
    await a.setSamplingMode('active');

    // Second (most recent) call passed the 'active' options.
    const lastCall = mockStartLocationUpdates.mock.calls[mockStartLocationUpdates.mock.calls.length - 1];
    const [, opts] = lastCall as [string, Record<string, unknown>];
    expect(opts.accuracy).toBe(6); // BestForNavigation — active mode
    expect(opts.timeInterval).toBe(1000);
  });

  it('all three modes share the same TASK_NAME (idempotent on the same task)', async () => {
    const a = new ExpoLocationAdapter();
    await a.setSamplingMode('active');
    await a.setSamplingMode('paused');
    await a.setSamplingMode('background-slc');

    const taskNames = mockStartLocationUpdates.mock.calls.map((c) => c[0]);
    expect(taskNames).toEqual([TASK_NAME, TASK_NAME, TASK_NAME]);
  });
});

describe('ExpoLocationAdapter.start / stop / permissions', () => {
  beforeEach(() => {
    mockStartLocationUpdates.mockClear();
    mockStopLocationUpdates.mockClear();
    mockHasStarted.mockReset();
    mockHasStarted.mockImplementation(() => Promise.resolve(false));
  });

  it('start() boots with the active-mode options when not yet running', async () => {
    const a = new ExpoLocationAdapter();
    await a.start();

    expect(mockStartLocationUpdates).toHaveBeenCalledTimes(1);
    const [, opts] = mockStartLocationUpdates.mock.calls[0] as [string, Record<string, unknown>];
    // start() uses MODE_OPTIONS.active → BestForNavigation
    expect(opts.accuracy).toBe(6);
    expect(opts.timeInterval).toBe(1000);
  });

  it('start() is idempotent — does nothing when already running', async () => {
    mockHasStarted.mockImplementation(() => Promise.resolve(true));
    const a = new ExpoLocationAdapter();
    await a.start();
    expect(mockStartLocationUpdates).not.toHaveBeenCalled();
  });

  it('stop() calls stopLocationUpdatesAsync when running', async () => {
    mockHasStarted.mockImplementation(() => Promise.resolve(true));
    const a = new ExpoLocationAdapter();
    await a.stop();
    expect(mockStopLocationUpdates).toHaveBeenCalledWith(TASK_NAME);
  });

  it('stop() is a no-op when not running', async () => {
    const a = new ExpoLocationAdapter();
    await a.stop();
    expect(mockStopLocationUpdates).not.toHaveBeenCalled();
  });
});
