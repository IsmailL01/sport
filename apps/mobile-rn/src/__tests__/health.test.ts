import { MockHealthAdapter } from '../health/MockHealthAdapter';
import { setHealthAdapter } from '../health';
import { writeSessionToHealth } from '../health/sync';
import type { HealthWorkout, ImportedWorkout } from '../health/HealthAdapter';

describe('MockHealthAdapter', () => {
  const sampleWorkout: HealthWorkout = {
    externalId: 's-1',
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_000_000 + 30 * 60 * 1000,
    distanceM: 5_000,
    activityType: 'running',
  };

  it('platform == mock', () => {
    const a = new MockHealthAdapter();
    expect(a.platform()).toBe('mock');
  });

  it('isAvailable resolves true', async () => {
    const a = new MockHealthAdapter();
    expect(await a.isAvailable()).toBe(true);
  });

  it('writeWorkout без permissions кидает ошибку', async () => {
    const a = new MockHealthAdapter();
    await expect(a.writeWorkout(sampleWorkout)).rejects.toThrow(/write-workouts/);
  });

  it('writeWorkout с permission сохраняет', async () => {
    const a = new MockHealthAdapter();
    await a.requestPermissions(['write-workouts']);
    await a.writeWorkout(sampleWorkout);
    expect(a.written()).toHaveLength(1);
    expect(a.written()[0].externalId).toBe('s-1');
  });

  it('writeWorkout идемпотентен по externalId', async () => {
    const a = new MockHealthAdapter();
    await a.requestPermissions(['write-workouts']);
    await a.writeWorkout(sampleWorkout);
    await a.writeWorkout({ ...sampleWorkout, distanceM: 6_000 });
    const w = a.written();
    expect(w).toHaveLength(1);
    expect(w[0].distanceM).toBe(6_000);
  });

  it('readWorkouts фильтрует по sinceMs', async () => {
    const a = new MockHealthAdapter();
    await a.requestPermissions(['read-workouts']);
    const old: ImportedWorkout = {
      ...sampleWorkout,
      externalId: 'x-old',
      startedAt: 1_000,
      endedAt: 1_500,
      source: 'mock',
      sourceUuid: 'uuid-old',
    };
    const recent: ImportedWorkout = {
      ...sampleWorkout,
      externalId: 'x-recent',
      startedAt: 1_700_000_000_000,
      endedAt: 1_700_000_000_500,
      source: 'mock',
      sourceUuid: 'uuid-recent',
    };
    a.seedImports([old, recent]);
    const r = await a.readWorkouts(1_700_000_000_000);
    expect(r).toHaveLength(1);
    expect(r[0].sourceUuid).toBe('uuid-recent');
  });

  it('grantedScopes отражает запрошенные', async () => {
    const a = new MockHealthAdapter();
    expect(await a.grantedScopes()).toEqual([]);
    await a.requestPermissions(['write-workouts', 'read-hr']);
    const g = await a.grantedScopes();
    expect(g).toContain('write-workouts');
    expect(g).toContain('read-hr');
  });
});

describe('writeSessionToHealth', () => {
  beforeEach(() => {
    setHealthAdapter(new MockHealthAdapter());
  });

  it('возвращает false если scope не выдан (не кидает)', async () => {
    const ok = await writeSessionToHealth({
      id: 1,
      startedAt: 1_000,
      endedAt: 2_000,
      distanceM: 5_000,
    });
    expect(ok).toBe(false);
  });

  it('пишет workout если scope выдан', async () => {
    const adapter = new MockHealthAdapter();
    setHealthAdapter(adapter);
    await adapter.requestPermissions(['write-workouts']);
    const ok = await writeSessionToHealth({
      id: 42,
      startedAt: 1_000,
      endedAt: 2_000,
      distanceM: 5_000,
      avgHrBpm: 150,
    });
    expect(ok).toBe(true);
    expect(adapter.written()).toHaveLength(1);
    expect(adapter.written()[0].externalId).toBe('local-42');
    expect(adapter.written()[0].avgHrBpm).toBe(150);
  });

  it('возвращает false при выкидывании ошибки adapter-ом', async () => {
    const adapter = new MockHealthAdapter();
    setHealthAdapter(adapter);
    // Без grant — write бросит, helper словит и вернёт false.
    const ok = await writeSessionToHealth({
      id: 1, startedAt: 0, endedAt: 0, distanceM: 0,
    });
    expect(ok).toBe(false);
  });
});
