// iOS gap-resume tests (Phase 1 / PHASE1-12 / Task 3).
// Покрытие: handleAppForeground reset-on-gap + lazy threshold + edge cases.
//
// Тестируем напрямую через SessionManager — без mock'а AppState. Store-level
// glue (`AppState.addEventListener('change', ...)`) — это просто проводка,
// проверяется вручную на устройстве (см. plan <verification>).

import { SessionManager, type SessionRepo } from '../domain/session/SessionManager';
import { ClosureDetector } from '../domain/ClosureDetector';
import type { LocationAdapter, SamplingMode } from '../location/LocationAdapter';
import type { Filter } from '../pipeline/Filter';
import { PauseDetector } from '../pipeline/filters/PauseDetector';
import { Pipeline } from '../pipeline/Pipeline';
import type { Point, RawPoint, Session } from '../domain/types';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeRaw(opts: Partial<RawPoint> & { ts?: number; lat?: number; lon?: number } = {}): RawPoint {
  return {
    timestamp: opts.ts ?? 0,
    latitude: opts.lat ?? 50,
    longitude: opts.lon ?? 10,
    altitude: opts.altitude ?? null,
    accuracy: opts.accuracy ?? 5,
    speed: opts.speed ?? null,
    heading: opts.heading ?? null,
  };
}

function makeMockRepo(): SessionRepo {
  return {
    createSession: jest.fn(),
    finalizeSession: jest.fn(),
    deleteSession: jest.fn(),
    findActiveSession: jest.fn<Session | null, []>(() => null),
    appendPoints: jest.fn(),
    loadPointsForSession: jest.fn<Point[], [number]>(() => []),
    appendLapsForSession: jest.fn(),
    aggregateHrForSession: jest.fn(() => ({ avgHrBpm: null, maxHrBpm: null })),
  };
}

function makeMockAdapter(): LocationAdapter {
  return {
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    isRunning: jest.fn(() => Promise.resolve(true)),
    requestForegroundPermission: jest.fn(() => Promise.resolve(true)),
    requestBackgroundPermission: jest.fn(() => Promise.resolve(true)),
    setSamplingMode: jest.fn(async (_m: SamplingMode) => undefined),
  };
}

function makePipelineWithResetSpy(): { pipeline: Pipeline; reset: jest.Mock } {
  const reset = jest.fn();
  const passthrough: Filter = {
    name: 'passthrough',
    apply: (p: Point) => p,
    reset,
  };
  return { pipeline: new Pipeline([passthrough]), reset };
}

function makeManager(opts: { gapTriggerSec?: number | (() => number) } = {}) {
  const repo = makeMockRepo();
  const adapter = makeMockAdapter();
  const { pipeline, reset } = makePipelineWithResetSpy();
  const pauseDetector = new PauseDetector(() => {});
  const closureDetector = new ClosureDetector(() => {});
  const trigger = opts.gapTriggerSec;
  const getter: () => number =
    typeof trigger === 'function'
      ? trigger
      : (() => {
          const v = typeof trigger === 'number' ? trigger : 30;
          return () => v;
        })();
  const onChange = jest.fn();
  const m = new SessionManager(
    pipeline,
    pauseDetector,
    closureDetector,
    repo,
    adapter,
    getter,
    onChange,
  );
  return { m, reset, pipeline, adapter, repo };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SessionManager.handleAppForeground (iOS gap-resume / PHASE1-12)', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 14, 12, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls pipeline.reset() + console.warn when gap > thresholdMs', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { m, reset } = makeManager({ gapTriggerSec: 30 });

    m.start('run');
    const now = Date.now();
    // Add a point 60s old → 60s gap > 30s threshold.
    m.ingestRawPoint(makeRaw({ ts: now - 60_000 }));
    reset.mockClear();

    m.handleAppForeground();

    expect(reset).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    const msg = (warnSpy.mock.calls[0]?.[0] ?? '') as string;
    expect(msg).toMatch(/\[gap-resume\]/);
    expect(msg).toMatch(/pipeline reset/);

    warnSpy.mockRestore();
  });

  it('does NOT call pipeline.reset() when gap < thresholdMs', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { m, reset } = makeManager({ gapTriggerSec: 30 });

    m.start('run');
    const now = Date.now();
    // Add a point 10s old → 10s gap < 30s threshold.
    m.ingestRawPoint(makeRaw({ ts: now - 10_000 }));
    reset.mockClear();

    m.handleAppForeground();

    expect(reset).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('is a no-op when points.length === 0 (no division-by-zero or null-deref)', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { m, reset } = makeManager({ gapTriggerSec: 30 });

    // idle, no session, no points
    expect(() => m.handleAppForeground()).not.toThrow();
    expect(reset).not.toHaveBeenCalled();

    // Even after start(), if no points were ingested, still a no-op.
    m.start('run');
    reset.mockClear();
    m.handleAppForeground();
    expect(reset).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('reads gpsGapTriggerS lazily from getter — settings changes take effect on next foreground', () => {
    let triggerS = 30;
    const { m, reset } = makeManager({ gapTriggerSec: () => triggerS });

    m.start('run');
    const now = Date.now();
    // Add a point 45s old.
    m.ingestRawPoint(makeRaw({ ts: now - 45_000 }));
    reset.mockClear();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // First foreground with threshold 30 → 45 > 30 → reset.
    m.handleAppForeground();
    expect(reset).toHaveBeenCalledTimes(1);

    // Increase threshold to 120; the same gap (still 45s — no new points added)
    // should now NOT trigger reset.
    triggerS = 120;
    reset.mockClear();
    m.handleAppForeground();
    expect(reset).not.toHaveBeenCalled();

    // Decrease threshold to 10; same gap → reset fires again.
    triggerS = 10;
    reset.mockClear();
    m.handleAppForeground();
    expect(reset).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it('uses the LATEST point timestamp (not the first) to compute gap', () => {
    const { m, reset } = makeManager({ gapTriggerSec: 30 });

    m.start('run');
    const now = Date.now();
    // First point 5min old, then fresh point 5s old.
    m.ingestRawPoint(makeRaw({ ts: now - 300_000, lat: 50.0, lon: 10.0 }));
    m.ingestRawPoint(makeRaw({ ts: now - 5_000, lat: 50.001, lon: 10.0 }));
    reset.mockClear();

    // Gap from LAST point = 5s, not 300s. Should NOT trigger reset.
    m.handleAppForeground();
    expect(reset).not.toHaveBeenCalled();
  });

  it('gap exactly equal to threshold does NOT trigger reset (strict > comparison)', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { m, reset } = makeManager({ gapTriggerSec: 30 });

    m.start('run');
    const now = Date.now();
    // Exactly 30s old → 30000ms gap. Threshold is 30 * 1000 = 30000ms.
    // The check is `gapMs > thresholdMs`, so equality is NOT a trigger.
    m.ingestRawPoint(makeRaw({ ts: now - 30_000 }));
    reset.mockClear();

    m.handleAppForeground();

    expect(reset).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('warn log includes the actual gap duration in milliseconds', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { m } = makeManager({ gapTriggerSec: 30 });

    m.start('run');
    const now = Date.now();
    m.ingestRawPoint(makeRaw({ ts: now - 75_000 }));

    m.handleAppForeground();

    expect(warnSpy).toHaveBeenCalled();
    const msg = (warnSpy.mock.calls[0]?.[0] ?? '') as string;
    // Should mention 75000 (or similar — Date.now() may have advanced a few ms)
    expect(msg).toMatch(/7[0-9]{4}ms/);

    warnSpy.mockRestore();
  });
});
