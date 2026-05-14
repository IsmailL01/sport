import { planWorkout } from '../health/importPlan';
import type { ImportedWorkout } from '../health';

function w(overrides: Partial<ImportedWorkout> = {}): ImportedWorkout {
  return {
    externalId: 'x',
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_000_000 + 30 * 60 * 1000,
    distanceM: 5000,
    calories: 300,
    avgHrBpm: 150,
    activityType: 'running',
    source: 'health-connect',
    sourceUuid: 'hc-uuid-001',
    ...overrides,
  };
}

describe('planWorkout', () => {
  it('decision=insert для валидной новой тренировки', () => {
    const plan = planWorkout(w(), 'health-connect', new Set());
    expect(plan.decision).toBe('insert');
    if (plan.decision === 'insert') {
      expect(plan.row.sessionId).toBe(w().startedAt);
      expect(plan.row.source).toBe('health-connect');
      expect(plan.row.externalUuid).toBe('hc-uuid-001');
      expect(plan.row.activity).toBe('run');
      expect(plan.row.durationS).toBe(1800);
    }
  });

  it('decision=duplicate если (source, sourceUuid) уже импортирован', () => {
    const plan = planWorkout(w(), 'health-connect', new Set(['health-connect:hc-uuid-001']));
    expect(plan.decision).toBe('duplicate');
    if (plan.decision === 'duplicate') {
      expect(plan.sourceUuid).toBe('hc-uuid-001');
    }
  });

  it('dedup по source и uuid: тот же uuid из другой платформы — insert', () => {
    const plan = planWorkout(
      w({ source: 'apple-health' }),
      'apple-health',
      new Set(['health-connect:hc-uuid-001']),
    );
    expect(plan.decision).toBe('insert');
  });

  it('decision=reject для невозможного pace running (<2:30/km)', () => {
    const plan = planWorkout(
      w({ endedAt: w().startedAt + 5 * 60 * 1000 }), // 5km за 5min
      'health-connect',
      new Set(),
    );
    expect(plan.decision).toBe('reject');
    if (plan.decision === 'reject') {
      expect(plan.reason).toBe('pace_too_fast');
    }
  });

  it('ACTIVITY_MAP: walking → walk, cycling → cycle, other → generic_cardio', () => {
    const a = planWorkout(w({ activityType: 'walking', sourceUuid: 'w-1' }), 'health-connect', new Set());
    const b = planWorkout(w({ activityType: 'cycling', sourceUuid: 'c-1', distanceM: 30_000, endedAt: w().startedAt + 60 * 60 * 1000 }), 'health-connect', new Set());
    const c = planWorkout(w({ activityType: 'other', sourceUuid: 'o-1' }), 'health-connect', new Set());
    expect(a.decision === 'insert' && a.row.activity).toBe('walk');
    expect(b.decision === 'insert' && b.row.activity).toBe('cycle');
    expect(c.decision === 'insert' && c.row.activity).toBe('generic_cardio');
  });

  it('одна тренировка из двух источников = два insert (caller потом merge)', () => {
    const fromWatch = planWorkout(
      w({ source: 'apple-health', sourceUuid: 'hk-1' }),
      'apple-health',
      new Set(),
    );
    const fromStrava = planWorkout(
      w({ source: 'strava', sourceUuid: 'strava-42' }),
      'strava',
      new Set(['apple-health:hk-1']),
    );
    expect(fromWatch.decision).toBe('insert');
    expect(fromStrava.decision).toBe('insert');
    // Per docs/INTEGRATIONS.md §3 — это известное поведение. Cross-source
    // merge — отдельная задача (P3).
  });
});
