// Integration test for the full PauseDetector → SessionManager pause/resume
// flow. Wires real PauseDetector (with warmup) into a real SessionManager
// and validates that:
//   1. warmup gate prevents premature auto-pause during GPS lock
//   2. time-freeze accounting works across auto-paused → auto-resumed cycle
//   3. effective elapsed time correctly excludes paused windows
//
// This is the closest jest can get to "user starts → pauses → resumes →
// stops" without RN render. The rendering integration (TrackerLiveScreen
// reads selectors and computes durationS) is validated via APK manual smoke.

import { SessionManager, type SessionRepo } from '../SessionManager';
import { ClosureDetector } from '../../ClosureDetector';
import type { LocationAdapter, SamplingMode } from '../../../location/LocationAdapter';
import { PauseDetector, type PauseEvent } from '../../../pipeline/filters/PauseDetector';
import { Pipeline } from '../../../pipeline/Pipeline';
import type { Filter } from '../../../pipeline/Filter';
import type { Point, RawPoint } from '../../types';

function makeRaw(opts: { ts: number; speed: number; lat?: number; lng?: number }): RawPoint {
  return {
    timestamp: opts.ts,
    latitude: opts.lat ?? 55.7558,
    longitude: opts.lng ?? 37.6173,
    altitude: null,
    accuracy: 5,
    speed: opts.speed,
    heading: null,
  };
}

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

const T0 = new Date(2026, 4, 25, 12, 0, 0).getTime();

describe('SessionManager + PauseDetector — integration flow', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(T0);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * End-to-end run scenario:
   *
   *  T+0..10s  — warmup, runner stationary while GPS locks
   *  T+10..40s — runner moves at 3 m/s (fast)
   *  T+40..70s — runner stops at traffic light (auto-pause should fire)
   *  T+70..90s — runner resumes at 3 m/s (auto-resume should fire)
   *
   * Validates the full sequence + that effective elapsed correctly
   * excludes the 30s traffic-light pause.
   */
  it('full run with warmup → motion → traffic-light pause → resume', () => {
    const events: PauseEvent[] = [];
    const pd = new PauseDetector(
      (e) => {
        events.push(e);
        // Wire PauseDetector emissions into SessionManager (this is what
        // state/activity.ts does in production).
        manager.setPaused(e.type === 'auto-paused');
      },
      0.5, 5_000, 1.5, 2_000,
      { warmupMs: 10_000, warmupMeters: 2 },
    );
    const manager = new SessionManager(
      makeNoopPipeline(),
      pd,
      new ClosureDetector(() => {}),
      makeMockRepo(),
      makeMockAdapter(),
      () => 30,
      () => {},
    );

    manager.start();

    // Phase 1: warmup (0-10s stationary)
    for (let s = 0; s < 10; s += 1) {
      manager.ingestRawPoint(
        makeRaw({ ts: T0 + s * 1000, speed: 0.1, lat: 55.7558, lng: 37.6173 }),
      );
    }
    // No pause events fired during warmup
    expect(events).toHaveLength(0);
    expect(manager.snapshot().isPaused).toBe(false);

    // Phase 2: motion 10-40s at 3 m/s (latitude shifts to indicate motion)
    for (let s = 10; s < 40; s += 1) {
      manager.ingestRawPoint(
        makeRaw({
          ts: T0 + s * 1000,
          speed: 3.0,
          lat: 55.7558 + (s - 10) * 0.0001, // ~11m per second of latitude shift
          lng: 37.6173,
        }),
      );
    }

    // Phase 3: stationary at traffic light 40-70s — auto-pause should fire
    // within ~5s of stationary points
    jest.setSystemTime(T0 + 40_000);
    for (let s = 40; s < 70; s += 1) {
      jest.setSystemTime(T0 + s * 1000);
      manager.ingestRawPoint(
        makeRaw({
          ts: T0 + s * 1000,
          speed: 0.1,
          lat: 55.7558 + 30 * 0.0001,
          lng: 37.6173,
        }),
      );
    }

    const pausedEvents = events.filter((e) => e.type === 'auto-paused');
    expect(pausedEvents.length).toBeGreaterThanOrEqual(1);
    expect(manager.snapshot().isPaused).toBe(true);
    expect(manager.snapshot().pausedAt).not.toBeNull();

    // Phase 4: resume motion at T+70s
    for (let s = 70; s < 90; s += 1) {
      jest.setSystemTime(T0 + s * 1000);
      manager.ingestRawPoint(
        makeRaw({
          ts: T0 + s * 1000,
          speed: 3.0,
          lat: 55.7558 + (s - 40) * 0.0001,
          lng: 37.6173,
        }),
      );
    }

    const resumedEvents = events.filter((e) => e.type === 'auto-resumed');
    expect(resumedEvents.length).toBeGreaterThanOrEqual(1);
    expect(manager.snapshot().isPaused).toBe(false);
    expect(manager.snapshot().pausedDurationMs).toBeGreaterThan(0);

    // Final assertion: effective elapsed at T+90s ≈ 90s wall - ~25s pause
    // (5s detection delay + ~20s actual stationary before resumed)
    jest.setSystemTime(T0 + 90_000);
    const effective = manager.effectiveElapsedMs(T0 + 90_000);
    // We can't assert exact value because pause boundaries depend on
    // detector internals — but it MUST be less than wall-clock 90s and
    // greater than 30s (active periods only).
    expect(effective).toBeLessThan(90_000);
    expect(effective).toBeGreaterThan(30_000);
  });

  it('warmup is fully reset across start() — second session not affected', () => {
    const events: PauseEvent[] = [];
    const pd = new PauseDetector(
      (e) => {
        events.push(e);
        manager.setPaused(e.type === 'auto-paused');
      },
      0.5, 5_000, 1.5, 2_000,
      { warmupMs: 10_000, warmupMeters: 2 },
    );
    const manager = new SessionManager(
      makeNoopPipeline(),
      pd,
      new ClosureDetector(() => {}),
      makeMockRepo(),
      makeMockAdapter(),
      () => 30,
      () => {},
    );

    // First session — warmup expires, auto-pause fires
    manager.start();
    for (let s = 0; s < 12; s += 1) {
      manager.ingestRawPoint(makeRaw({ ts: T0 + s * 1000, speed: 0.1 }));
    }
    expect(events.some((e) => e.type === 'auto-paused')).toBe(true);
    manager.stop();
    events.length = 0;

    // Second session at wall-time T0+100s — warmup gate must restart
    jest.setSystemTime(T0 + 100_000);
    manager.start();
    for (let s = 100; s < 106; s += 1) {
      manager.ingestRawPoint(makeRaw({ ts: T0 + s * 1000, speed: 0.1 }));
    }
    // Within 6s into new session — still in warmup; no auto-pause yet
    expect(events).toHaveLength(0);
  });
});
