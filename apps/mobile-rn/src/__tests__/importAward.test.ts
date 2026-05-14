// E2E (без SQLite): MockHealthAdapter → pullSince → sanity check → currency
// award. Проверяет контракт интеграций.

import { MockHealthAdapter } from '../health/MockHealthAdapter';
import { checkWorkoutSanity } from '../health/importSanity';
import { decideCoinsForSession, type ActivityType } from '../domain/currency';
import type { ImportedWorkout } from '../health';

const ACTIVITY_MAP: Record<ImportedWorkout['activityType'], ActivityType> = {
  running: 'run',
  walking: 'walk',
  cycling: 'cycle',
  other: 'generic_cardio',
};

describe('Integration: MockHealthAdapter → award coins', () => {
  it('pulls workouts, filters by sanity, and awards via decideCoinsForSession', async () => {
    const adapter = new MockHealthAdapter();
    await adapter.requestPermissions(['read-workouts']);
    adapter.seedImports([
      // Valid 5km run.
      {
        externalId: 'a',
        startedAt: 1000,
        endedAt: 1000 + 25 * 60 * 1000,
        distanceM: 5000,
        calories: 300,
        avgHrBpm: 150,
        activityType: 'running',
        source: 'mock',
        sourceUuid: 'uuid-a',
      },
      // Invalid: impossible pace.
      {
        externalId: 'b',
        startedAt: 2_000_000,
        endedAt: 2_000_000 + 5 * 60 * 1000,
        distanceM: 5000,
        calories: 300,
        avgHrBpm: 150,
        activityType: 'running',
        source: 'mock',
        sourceUuid: 'uuid-b',
      },
      // Valid 1h cycling.
      {
        externalId: 'c',
        startedAt: 3_000_000,
        endedAt: 3_000_000 + 60 * 60 * 1000,
        distanceM: 20_000,
        calories: 500,
        avgHrBpm: 130,
        activityType: 'cycling',
        source: 'mock',
        sourceUuid: 'uuid-c',
      },
    ]);

    const pulled = await adapter.pullSince(null);
    expect(pulled).toHaveLength(3);

    const accepted = pulled.filter((w) => checkWorkoutSanity(w) === null);
    expect(accepted.map((w) => w.sourceUuid)).toEqual(['uuid-a', 'uuid-c']);

    let coinsTotal = 0;
    let coinsEarnedToday = 0;
    for (const w of accepted) {
      const decision = decideCoinsForSession({
        kcalBurned: w.calories ?? 0,
        durationS: (w.endedAt - w.startedAt) / 1000,
        distanceM: w.distanceM,
        activity: ACTIVITY_MAP[w.activityType],
        avgHrBpm: w.avgHrBpm ?? null,
        coinsEarnedToday,
      });
      coinsTotal += decision.coins;
      coinsEarnedToday += decision.coins;
    }

    // 300 kcal × 1.0 / 10 = 30 + 500 kcal × 0.9 / 10 = 45 → 75 coins total.
    expect(coinsTotal).toBe(75);
  });

  it('respects daily cap when many imports stack', async () => {
    const adapter = new MockHealthAdapter();
    await adapter.requestPermissions(['read-workouts']);
    const imports: ImportedWorkout[] = [];
    for (let i = 0; i < 30; i++) {
      imports.push({
        externalId: `i-${i}`,
        startedAt: 1_000_000 + i * 3_600_000,
        endedAt: 1_000_000 + i * 3_600_000 + 30 * 60 * 1000,
        distanceM: 5000,
        calories: 300,
        avgHrBpm: 150,
        activityType: 'running',
        source: 'mock',
        sourceUuid: `uuid-${i}`,
      });
    }
    adapter.seedImports(imports);

    const pulled = await adapter.pullSince(null);
    let coinsEarnedToday = 0;
    for (const w of pulled) {
      if (checkWorkoutSanity(w) !== null) continue;
      const d = decideCoinsForSession({
        kcalBurned: w.calories ?? 0,
        durationS: (w.endedAt - w.startedAt) / 1000,
        distanceM: w.distanceM,
        activity: 'run',
        avgHrBpm: w.avgHrBpm ?? null,
        coinsEarnedToday,
      });
      coinsEarnedToday += d.coins;
    }
    // Кап в decideCoinsForSession — 500 монет/день. Все 30 сессий не должны
    // дать больше 500 в сумме.
    expect(coinsEarnedToday).toBeLessThanOrEqual(500);
    expect(coinsEarnedToday).toBe(500);
  });
});
