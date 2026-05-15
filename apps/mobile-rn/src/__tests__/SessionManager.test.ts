// SessionManager — unit tests (PHASE1-07 / Task 2).
// Mock-репо паттерн адаптирован из walletStore.test.ts:8-45.
// makePoint-хелпер заимствован из pipeline.test.ts:1-20.
// Все тесты — на чистом классе без zustand/jest-expo нативных мостов.

import { SessionManager, type SessionRepo } from '../domain/session/SessionManager';
import { ClosureDetector } from '../domain/ClosureDetector';
import type { LocationAdapter, SamplingMode } from '../location/LocationAdapter';
import { PauseDetector } from '../pipeline/filters/PauseDetector';
import { Pipeline } from '../pipeline/Pipeline';
import type { Filter } from '../pipeline/Filter';
import type { ActivityType, Point, RawPoint, Session } from '../domain/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePoint(opts: Partial<Point> & { ts?: number; lat?: number; lon?: number } = {}): Point {
  return {
    timestamp: opts.ts ?? 0,
    latitude: opts.lat ?? 50,
    longitude: opts.lon ?? 10,
    altitude: opts.altitude ?? null,
    accuracy: opts.accuracy ?? 5,
    speed: opts.speed ?? null,
    heading: opts.heading ?? null,
    source: opts.source ?? 'raw',
  };
}

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

function makeMockRepo(): SessionRepo & { __calls: string[] } {
  const calls: string[] = [];
  return {
    createSession: jest.fn((s) => {
      calls.push(`createSession:${s.id}`);
    }),
    finalizeSession: jest.fn((sid) => {
      calls.push(`finalizeSession:${sid}`);
    }),
    deleteSession: jest.fn((sid) => {
      calls.push(`deleteSession:${sid}`);
    }),
    findActiveSession: jest.fn<Session | null, []>(() => null),
    appendPoints: jest.fn((sid, pts) => {
      calls.push(`appendPoints:${sid}:${pts.length}`);
    }),
    loadPointsForSession: jest.fn<Point[], [number]>(() => []),
    appendLapsForSession: jest.fn((sid, laps) => {
      calls.push(`appendLapsForSession:${sid}:${laps.length}`);
    }),
    aggregateHrForSession: jest.fn(() => ({ avgHrBpm: null as number | null, maxHrBpm: null as number | null })),
    __calls: calls,
  };
}

// Pass-through pipeline (no filters dropping anything). Lets us inject points
// without GPS-physics complexity.
function makeNoopPipeline(): Pipeline {
  const passthrough: Filter = {
    name: 'passthrough',
    apply: (p: Point) => p,
    reset: () => {},
  };
  return new Pipeline([passthrough]);
}

/**
 * Mock LocationAdapter, tracking each setSamplingMode call into a string[]
 * для проверки порядка переходов (PHASE1-11 / D-28).
 */
type MockAdapter = LocationAdapter & {
  __modes: SamplingMode[];
  setSamplingMode: jest.Mock;
};

function makeMockAdapter(): MockAdapter {
  const modes: SamplingMode[] = [];
  const setSamplingMode = jest.fn(async (m: SamplingMode) => {
    modes.push(m);
  });
  return {
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    isRunning: jest.fn(() => Promise.resolve(true)),
    requestForegroundPermission: jest.fn(() => Promise.resolve(true)),
    requestBackgroundPermission: jest.fn(() => Promise.resolve(true)),
    setSamplingMode,
    __modes: modes,
  };
}

function makeManager(overrides: {
  repo?: SessionRepo;
  onChange?: jest.Mock;
  pipeline?: Pipeline;
  closureDetector?: ClosureDetector;
  pauseDetector?: PauseDetector;
  adapter?: MockAdapter;
  gapTriggerSecGetter?: () => number;
} = {}) {
  const repo = overrides.repo ?? makeMockRepo();
  const onChange = overrides.onChange ?? jest.fn();
  const pipeline = overrides.pipeline ?? makeNoopPipeline();
  const pauseDetector = overrides.pauseDetector ?? new PauseDetector(() => {});
  const closureDetector = overrides.closureDetector ?? new ClosureDetector(() => {});
  const adapter = overrides.adapter ?? makeMockAdapter();
  const gapTriggerSecGetter = overrides.gapTriggerSecGetter ?? (() => 30);
  const m = new SessionManager(
    pipeline,
    pauseDetector,
    closureDetector,
    repo,
    adapter,
    gapTriggerSecGetter,
    onChange,
  );
  return { m, repo, onChange, pipeline, pauseDetector, closureDetector, adapter };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SessionManager', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 14, 12, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('start()', () => {
    it("start('run') transitions idle → recording, creates session, fires onChange", () => {
      const onChange = jest.fn();
      const { m, repo } = makeManager({ onChange });

      m.start('run');

      expect(m.snapshot().state).toBe('recording');
      expect(m.snapshot().activityType).toBe('run');
      expect(repo.createSession).toHaveBeenCalledTimes(1);
      const [arg] = (repo.createSession as jest.Mock).mock.calls[0];
      expect(arg.id).toBe(arg.startedAt); // id === startedAt invariant
      expect(arg.activityType).toBe('run');
      expect(onChange).toHaveBeenCalled();
    });

    it('start() while already recording is a no-op (no second createSession)', () => {
      const { m, repo } = makeManager();
      m.start('run');
      const callsAfterFirst = (repo.createSession as jest.Mock).mock.calls.length;
      m.start('cycle'); // second start
      expect((repo.createSession as jest.Mock).mock.calls.length).toBe(callsAfterFirst);
      // state remains recording, activityType is the FIRST one (no re-init)
      expect(m.snapshot().state).toBe('recording');
      expect(m.snapshot().activityType).toBe('run');
    });

    it('start() supports trail / walk / cycle / treadmill activity types', () => {
      const types: ActivityType[] = ['trail', 'walk', 'cycle', 'treadmill'];
      for (const t of types) {
        const { m } = makeManager();
        m.start(t);
        expect(m.snapshot().activityType).toBe(t);
      }
    });
  });

  describe('ingestRawPoint()', () => {
    it('passes raw through pipeline.process and calls acceptPoint when non-null', () => {
      const { m, onChange } = makeManager();
      m.start('run');
      onChange.mockClear();

      m.ingestRawPoint(makeRaw({ ts: 1000, lat: 50.0, lon: 10.0 }));

      const snap = m.snapshot();
      expect(snap.points.length).toBe(1);
      expect(snap.points[0].timestamp).toBe(1000);
      expect(onChange).toHaveBeenCalled();
    });

    it('drops raw when pipeline returns null (no acceptPoint, no onChange beyond counter)', () => {
      // Make a dropping pipeline: returns null always.
      const drop: Filter = { name: 'drop-all', apply: () => null, reset: () => {} };
      const droppingPipeline = new Pipeline([drop]);
      const { m, onChange } = makeManager({ pipeline: droppingPipeline });
      m.start('run');
      const ptsBefore = m.snapshot().points.length;
      onChange.mockClear();

      m.ingestRawPoint(makeRaw({ ts: 1000 }));

      // Raw counter incremented but no points added.
      expect(m.snapshot().points.length).toBe(ptsBefore);
      // onChange may still fire (for rawCount update); that's OK. Point is: no acceptPoint.
    });

    it('ingestRawPoint while idle still counts raw but does not add point (acceptPoint guards on state)', () => {
      const { m } = makeManager();
      m.ingestRawPoint(makeRaw({ ts: 500 }));
      expect(m.snapshot().points.length).toBe(0);
      expect(m.snapshot().state).toBe('idle');
    });
  });

  describe('markLap()', () => {
    it('two synchronous markLap calls produce two laps (R7 race-safety invariant preserved)', () => {
      const { m } = makeManager();
      m.start('run');
      // Need ≥2 points before each markLap. Add 4 points to allow 2 laps.
      m.ingestRawPoint(makeRaw({ ts: 1000, lat: 50.000, lon: 10.000 }));
      m.ingestRawPoint(makeRaw({ ts: 2000, lat: 50.001, lon: 10.000 }));
      m.markLap();
      m.ingestRawPoint(makeRaw({ ts: 3000, lat: 50.002, lon: 10.000 }));
      m.ingestRawPoint(makeRaw({ ts: 4000, lat: 50.003, lon: 10.000 }));
      m.markLap();

      expect(m.snapshot().laps.length).toBe(2);
      expect(m.snapshot().laps[0].lapNumber).toBe(1);
      expect(m.snapshot().laps[1].lapNumber).toBe(2);
    });

    it('markLap with <2 points since last mark is rejected (defensive guard)', () => {
      const { m } = makeManager();
      m.start('run');
      m.ingestRawPoint(makeRaw({ ts: 1000, lat: 50.0, lon: 10.0 }));
      // Only 1 point — markLap should be rejected.
      m.markLap();
      expect(m.snapshot().laps.length).toBe(0);
    });

    it('markLap while not recording is a no-op', () => {
      const { m } = makeManager();
      m.markLap(); // idle
      expect(m.snapshot().laps.length).toBe(0);
    });
  });

  describe('stop()', () => {
    it('finalizes session, computes metrics, transitions to stopped, fires onChange', () => {
      const onChange = jest.fn();
      const { m, repo } = makeManager({ onChange });
      m.start('run');
      m.ingestRawPoint(makeRaw({ ts: 1000, lat: 50.0, lon: 10.0 }));
      m.ingestRawPoint(makeRaw({ ts: 2000, lat: 50.001, lon: 10.0 }));
      onChange.mockClear();

      m.stop();

      expect(m.snapshot().state).toBe('stopped');
      expect(repo.finalizeSession).toHaveBeenCalledTimes(1);
      const [sid, finals] = (repo.finalizeSession as jest.Mock).mock.calls[0];
      expect(typeof sid).toBe('number');
      expect(typeof finals.endedAt).toBe('number');
      expect(typeof finals.distanceM).toBe('number');
      expect(onChange).toHaveBeenCalled();
    });

    it('stop while not recording is a no-op', () => {
      const { m, repo } = makeManager();
      m.stop(); // idle
      expect(repo.finalizeSession).not.toHaveBeenCalled();
      expect(m.snapshot().state).toBe('idle');
    });
  });

  describe('recoverLast()', () => {
    it('loads active session into stopped state (no resume-to-recording yet)', () => {
      const repo = makeMockRepo();
      const fakeSession: Session = {
        id: 1700000000000,
        startedAt: 1700000000000,
        endedAt: null,
        isClosed: false,
        distanceM: 1234,
        areaM2: null,
        calcMethod: null,
        note: null,
        avgHrBpm: null,
        maxHrBpm: null,
        caloriesKcal: null,
        activityType: 'trail',
      };
      (repo.findActiveSession as jest.Mock).mockReturnValue(fakeSession);
      (repo.loadPointsForSession as jest.Mock).mockReturnValue([
        makePoint({ ts: 1700000001000 }),
        makePoint({ ts: 1700000002000 }),
      ]);
      const { m } = makeManager({ repo });

      m.recoverLast();

      const snap = m.snapshot();
      expect(snap.state).toBe('stopped'); // NOT 'recording' — no resume path yet
      expect(snap.sessionId).toBe(fakeSession.id);
      expect(snap.points.length).toBe(2);
      expect(snap.activityType).toBe('trail');
    });

    it('returns silently when no active session', () => {
      const repo = makeMockRepo();
      (repo.findActiveSession as jest.Mock).mockReturnValue(null);
      const { m } = makeManager({ repo });

      m.recoverLast();

      expect(m.snapshot().state).toBe('idle');
      expect(m.snapshot().sessionId).toBeNull();
    });
  });

  describe('snapshot()', () => {
    it('returns a fresh object — mutating returned arrays does NOT corrupt internal state', () => {
      const { m } = makeManager();
      m.start('run');
      m.ingestRawPoint(makeRaw({ ts: 1000 }));
      m.ingestRawPoint(makeRaw({ ts: 2000 }));

      const snap = m.snapshot();
      snap.points.push(makePoint({ ts: 9999 }));
      snap.laps.push({
        lapNumber: 999,
        startedAt: 0,
        endedAt: 0,
        distanceM: 0,
        durationS: 0,
        paceMinKm: null,
        avgHrBpm: null,
      });

      const snap2 = m.snapshot();
      expect(snap2.points.length).toBe(2);
      expect(snap2.laps.length).toBe(0);
    });
  });

  describe('error handling', () => {
    it('repo.createSession throwing is caught + logged, manager method does not throw', () => {
      const repo = makeMockRepo();
      (repo.createSession as jest.Mock).mockImplementation(() => {
        throw new Error('DB locked');
      });
      const { m } = makeManager({ repo });
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => m.start('run')).not.toThrow();
      expect(errSpy).toHaveBeenCalled();
      const msg = (errSpy.mock.calls[0]?.[0] ?? '') as string;
      expect(msg).toMatch(/\[session\]/);

      errSpy.mockRestore();
    });

    it('repo.finalizeSession throwing is caught + logged', () => {
      const repo = makeMockRepo();
      (repo.finalizeSession as jest.Mock).mockImplementation(() => {
        throw new Error('DB write failed');
      });
      const { m } = makeManager({ repo });
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      m.start('run');
      m.ingestRawPoint(makeRaw({ ts: 1000 }));
      m.ingestRawPoint(makeRaw({ ts: 2000 }));
      expect(() => m.stop()).not.toThrow();
      expect(errSpy).toHaveBeenCalled();
      // State transitions to stopped even though finalize failed.
      expect(m.snapshot().state).toBe('stopped');

      errSpy.mockRestore();
    });
  });

  describe('reset()', () => {
    it('reset deletes session via repo and restores idle defaults', () => {
      const { m, repo } = makeManager();
      m.start('run');
      m.ingestRawPoint(makeRaw({ ts: 1000 }));
      const sid = m.snapshot().sessionId!;

      m.reset();

      expect(repo.deleteSession).toHaveBeenCalledWith(sid);
      const snap = m.snapshot();
      expect(snap.state).toBe('idle');
      expect(snap.points.length).toBe(0);
      expect(snap.sessionId).toBeNull();
      expect(snap.laps.length).toBe(0);
    });
  });

  describe('acceptPoint()', () => {
    it('acceptPoint while idle is a no-op (state guard)', () => {
      const { m } = makeManager();
      m.acceptPoint(makePoint({ ts: 1000 }));
      expect(m.snapshot().points.length).toBe(0);
    });

    it('acceptPoint after start appends to points + buffers + fires onChange', () => {
      const onChange = jest.fn();
      const { m } = makeManager({ onChange });
      m.start('run');
      onChange.mockClear();

      m.acceptPoint(makePoint({ ts: 1000 }));

      expect(m.snapshot().points.length).toBe(1);
      expect(onChange).toHaveBeenCalled();
    });
  });

  // ── Adaptive sampling wiring (PHASE1-11 / D-28, Task 2) ────────────────────

  describe('setPaused() → LocationAdapter.setSamplingMode', () => {
    it("transition false→true calls setSamplingMode('paused') + pipeline.reset() exactly once", () => {
      const pipelineResetSpy = jest.fn();
      const passthrough: Filter = {
        name: 'passthrough',
        apply: (p) => p,
        reset: pipelineResetSpy,
      };
      const pipeline = new Pipeline([passthrough]);
      const adapter = makeMockAdapter();
      const { m } = makeManager({ pipeline, adapter });

      m.start('run');
      adapter.setSamplingMode.mockClear();
      pipelineResetSpy.mockClear();

      m.setPaused(true);

      expect(adapter.setSamplingMode).toHaveBeenCalledTimes(1);
      expect(adapter.__modes[adapter.__modes.length - 1]).toBe('paused');
      // Pipeline reset гарантирует Kalman re-init (RESEARCH.md §Pitfall 5).
      expect(pipelineResetSpy).toHaveBeenCalledTimes(1);
    });

    it("transition true→false calls setSamplingMode('active') + pipeline.reset()", () => {
      const pipelineResetSpy = jest.fn();
      const passthrough: Filter = {
        name: 'passthrough',
        apply: (p) => p,
        reset: pipelineResetSpy,
      };
      const pipeline = new Pipeline([passthrough]);
      const adapter = makeMockAdapter();
      const { m } = makeManager({ pipeline, adapter });

      m.start('run');
      m.setPaused(true); // first transition
      adapter.setSamplingMode.mockClear();
      pipelineResetSpy.mockClear();

      m.setPaused(false); // resume

      expect(adapter.setSamplingMode).toHaveBeenCalledTimes(1);
      expect(adapter.__modes[adapter.__modes.length - 1]).toBe('active');
      expect(pipelineResetSpy).toHaveBeenCalledTimes(1);
    });

    it('setPaused with same value (no transition) does NOT call setSamplingMode', () => {
      const adapter = makeMockAdapter();
      const { m } = makeManager({ adapter });

      m.start('run');
      adapter.setSamplingMode.mockClear();

      m.setPaused(false); // already false (default)
      expect(adapter.setSamplingMode).not.toHaveBeenCalled();

      m.setPaused(true);
      adapter.setSamplingMode.mockClear();
      m.setPaused(true); // same as previous — no transition
      expect(adapter.setSamplingMode).not.toHaveBeenCalled();
    });

    it('setSamplingMode rejection is caught + logged, manager does not throw', () => {
      const adapter = makeMockAdapter();
      adapter.setSamplingMode.mockImplementation(() => Promise.reject(new Error('Native task dead')));
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { m } = makeManager({ adapter });

      m.start('run');
      expect(() => m.setPaused(true)).not.toThrow();
      // Async rejection propagates as console.error — but synchronously the
      // manager already updated state. Verify state was updated despite the failure.
      expect(m.snapshot().isPaused).toBe(true);

      errSpy.mockRestore();
    });
  });

  // ── iOS gap-resume on AppState foreground (PHASE1-12 / D-29, Task 3) ───────
  // Note: full coverage lives in gapResume.test.ts (Task 3). These two cases
  // verify constructor wiring of gapTriggerSecGetter alongside Task 2 changes.

  describe('handleAppForeground() — constructor wiring smoke', () => {
    it('reads gapTriggerSec lazily from getter (changes in settings take effect)', () => {
      let triggerS = 30;
      const pipelineResetSpy = jest.fn();
      const passthrough: Filter = {
        name: 'passthrough',
        apply: (p) => p,
        reset: pipelineResetSpy,
      };
      const pipeline = new Pipeline([passthrough]);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { m } = makeManager({
        pipeline,
        gapTriggerSecGetter: () => triggerS,
      });

      // No points → handleAppForeground is a no-op.
      m.handleAppForeground();
      expect(pipelineResetSpy).not.toHaveBeenCalled();

      // Start session, add a stale point (50s old).
      m.start('run');
      pipelineResetSpy.mockClear();
      // System time is mocked to 2026-05-14 12:00:00 in beforeEach.
      const now = Date.now();
      m.ingestRawPoint(makeRaw({ ts: now - 50_000 }));
      pipelineResetSpy.mockClear();

      // 30s threshold → 50s gap exceeds → reset.
      m.handleAppForeground();
      expect(pipelineResetSpy).toHaveBeenCalledTimes(1);

      // Bump threshold above gap; reset should NOT fire (lazy read).
      triggerS = 120;
      pipelineResetSpy.mockClear();
      m.handleAppForeground();
      expect(pipelineResetSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });
});
