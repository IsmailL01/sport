// Time-freeze on pause — 2026-05-25 tracker-live-polish-pass.
// Validates that SessionManager.effectiveElapsedMs() freezes the clock
// during pause windows so UI timer doesn't tick while paused.

import { SessionManager, type SessionRepo } from '../SessionManager';
import { ClosureDetector } from '../../ClosureDetector';
import type { LocationAdapter, SamplingMode } from '../../../location/LocationAdapter';
import { PauseDetector } from '../../../pipeline/filters/PauseDetector';
import { Pipeline } from '../../../pipeline/Pipeline';
import type { Filter } from '../../../pipeline/Filter';
import type { Point } from '../../types';

// Minimal mocks (mirror src/__tests__/SessionManager.test.ts helpers).

function makeMockRepo(): SessionRepo {
  return {
    createSession: jest.fn(),
    finalizeSession: jest.fn(),
    deleteSession: jest.fn(),
    findActiveSession: jest.fn(() => null),
    appendPoints: jest.fn(),
    loadPointsForSession: jest.fn(() => []),
    appendLapsForSession: jest.fn(),
    aggregateHrForSession: jest.fn(() => ({ avgHrBpm: null, maxHrBpm: null })),
  };
}

function makeNoopPipeline(): Pipeline {
  const passthrough: Filter = {
    name: 'passthrough',
    apply: (p: Point) => p,
    reset: () => {},
  };
  return new Pipeline([passthrough]);
}

function makeMockAdapter(): LocationAdapter {
  return {
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    isRunning: jest.fn(() => Promise.resolve(true)),
    requestForegroundPermission: jest.fn(() => Promise.resolve(true)),
    requestBackgroundPermission: jest.fn(() => Promise.resolve(true)),
    setSamplingMode: jest.fn((_m: SamplingMode) => Promise.resolve()),
  };
}

function makeManager() {
  return new SessionManager(
    makeNoopPipeline(),
    new PauseDetector(() => {}),
    new ClosureDetector(() => {}),
    makeMockRepo(),
    makeMockAdapter(),
    () => 30,
    () => {},
  );
}

const T0 = new Date(2026, 4, 25, 12, 0, 0).getTime();

describe('SessionManager.effectiveElapsedMs — time-freeze on pause', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(T0);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns 0 before session starts', () => {
    const m = makeManager();
    expect(m.effectiveElapsedMs(T0)).toBe(0);
  });

  it('ticks forward with wall-clock while recording (no pause)', () => {
    const m = makeManager();
    m.start();
    expect(m.effectiveElapsedMs(T0)).toBe(0);
    expect(m.effectiveElapsedMs(T0 + 1_000)).toBe(1_000);
    expect(m.effectiveElapsedMs(T0 + 60_000)).toBe(60_000);
  });

  it('FREEZES during active pause — clock stops moving for UI', () => {
    const m = makeManager();
    m.start();
    // 30s of running
    expect(m.effectiveElapsedMs(T0 + 30_000)).toBe(30_000);
    // Pause at T0+30s
    jest.setSystemTime(T0 + 30_000);
    m.setPaused(true);
    // Wall clock advances to T0+60s — but timer should remain at 30s
    expect(m.effectiveElapsedMs(T0 + 60_000)).toBe(30_000);
    expect(m.effectiveElapsedMs(T0 + 90_000)).toBe(30_000);
  });

  it('resumes from frozen value after un-pause', () => {
    const m = makeManager();
    m.start();
    // Run 30s
    expect(m.effectiveElapsedMs(T0 + 30_000)).toBe(30_000);
    // Pause at 30s for 60s (until T0+90s)
    jest.setSystemTime(T0 + 30_000);
    m.setPaused(true);
    jest.setSystemTime(T0 + 90_000);
    m.setPaused(false);
    // From here: 30s frozen + 0 since unpause = 30s
    expect(m.effectiveElapsedMs(T0 + 90_000)).toBe(30_000);
    // 10s of additional running
    expect(m.effectiveElapsedMs(T0 + 100_000)).toBe(40_000);
  });

  it('accumulates across multiple pause cycles', () => {
    const m = makeManager();
    m.start();
    // Cycle 1: run 20s, pause 10s
    jest.setSystemTime(T0 + 20_000);
    m.setPaused(true);
    jest.setSystemTime(T0 + 30_000);
    m.setPaused(false);
    // Cycle 2: run another 20s, pause 30s
    jest.setSystemTime(T0 + 50_000);
    m.setPaused(true);
    jest.setSystemTime(T0 + 80_000);
    m.setPaused(false);
    // Net elapsed at T0+90s: 90s wall - 10s pause1 - 30s pause2 = 50s
    expect(m.effectiveElapsedMs(T0 + 90_000)).toBe(50_000);
  });

  it('snapshot exposes pausedAt + pausedDurationMs', () => {
    const m = makeManager();
    m.start();
    expect(m.snapshot().pausedAt).toBeNull();
    expect(m.snapshot().pausedDurationMs).toBe(0);

    jest.setSystemTime(T0 + 10_000);
    m.setPaused(true);
    expect(m.snapshot().pausedAt).toBe(T0 + 10_000);
    expect(m.snapshot().pausedDurationMs).toBe(0); // not yet finalized

    jest.setSystemTime(T0 + 25_000);
    m.setPaused(false);
    expect(m.snapshot().pausedAt).toBeNull();
    expect(m.snapshot().pausedDurationMs).toBe(15_000);
  });

  it('start() resets pause accounting from prior session', () => {
    const m = makeManager();
    m.start();
    jest.setSystemTime(T0 + 5_000);
    m.setPaused(true);
    jest.setSystemTime(T0 + 15_000);
    m.setPaused(false);
    expect(m.snapshot().pausedDurationMs).toBe(10_000);

    m.stop();
    // start() resets — accumulator zero again
    jest.setSystemTime(T0 + 100_000);
    m.start();
    expect(m.snapshot().pausedDurationMs).toBe(0);
    expect(m.snapshot().pausedAt).toBeNull();
  });

  it('stop() during active pause folds open pause into pausedDurationMs', () => {
    const m = makeManager();
    m.start();
    jest.setSystemTime(T0 + 10_000);
    m.setPaused(true);
    jest.setSystemTime(T0 + 40_000);
    // STOP fires while paused — should fold 30s open pause into accumulator
    m.stop();
    expect(m.snapshot().pausedDurationMs).toBe(30_000);
    expect(m.snapshot().pausedAt).toBeNull();
    expect(m.snapshot().isPaused).toBe(false);
  });

  it('recoverLast() resets pause accounting', () => {
    const m = makeManager();
    // Without going through start/stop, recoverLast should also reset
    m.recoverLast();
    expect(m.snapshot().pausedAt).toBeNull();
    expect(m.snapshot().pausedDurationMs).toBe(0);
  });
});
