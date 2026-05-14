// Pure planning логика для импорта тренировок. Без SQLite-зависимостей —
// тестируется без mock БД.
//
// importFromAdapter() в importRepo.ts использует эти helpers + INSERT OR
// IGNORE для атомарного дедупа. Раздел тестов покрывает только это
// планирование, fact импорта в БД — integration-тест в Round 4+.

import type { ActivityType } from '../domain/types';
import type { HealthPlatform, ImportedWorkout } from './HealthAdapter';
import { checkWorkoutSanity } from './importSanity';

export const ACTIVITY_MAP: Record<ImportedWorkout['activityType'], ActivityType> = {
  running: 'run',
  walking: 'walk',
  cycling: 'cycle',
  other: 'generic_cardio',
};

export type SessionInsertRow = {
  sessionId: number;
  startedAt: number;
  endedAt: number;
  distanceM: number;
  durationS: number;
  caloriesKcal: number | null;
  avgHrBpm: number | null;
  source: HealthPlatform;
  externalUuid: string;
  activity: ActivityType;
};

export type WorkoutPlan =
  | { decision: 'insert'; row: SessionInsertRow }
  | { decision: 'duplicate'; sourceUuid: string }
  | { decision: 'reject'; sourceUuid: string; reason: string };

/**
 * Решение про один workout — что с ним делать. Caller (importRepo) использует
 * это решение для INSERT OR IGNORE (insert) или skip (duplicate / reject).
 *
 * @param existingKeys Set of `${source}:${external_uuid}` уже импортированных
 *                     workouts (caller загружает из БД до начала batch).
 */
export function planWorkout(
  w: ImportedWorkout,
  platform: HealthPlatform,
  existingKeys: ReadonlySet<string>,
): WorkoutPlan {
  const why = checkWorkoutSanity(w);
  if (why !== null) {
    return { decision: 'reject', sourceUuid: w.sourceUuid, reason: why };
  }
  const key = `${platform}:${w.sourceUuid}`;
  if (existingKeys.has(key)) {
    return { decision: 'duplicate', sourceUuid: w.sourceUuid };
  }
  const durationS = Math.max(0, Math.floor((w.endedAt - w.startedAt) / 1000));
  const row: SessionInsertRow = {
    sessionId: w.startedAt,
    startedAt: w.startedAt,
    endedAt: w.endedAt,
    distanceM: w.distanceM,
    durationS,
    caloriesKcal: w.calories ?? null,
    avgHrBpm: w.avgHrBpm ?? null,
    source: platform,
    externalUuid: w.sourceUuid,
    activity: ACTIVITY_MAP[w.activityType],
  };
  return { decision: 'insert', row };
}
