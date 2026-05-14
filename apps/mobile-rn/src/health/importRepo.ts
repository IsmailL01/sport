// Import-repo: pull workouts из HealthAdapter и сохранить в sessions
// с дедупом по (source, external_uuid).
//
// См. docs/INTEGRATIONS.md §3.

import { getDatabase } from '../storage/database';
import { getHealthAdapter, type ImportedWorkout } from './index';
import { checkWorkoutSanity } from './importSanity';
import type { ActivityType } from '../domain/types';

export { checkWorkoutSanity };

const ACTIVITY_MAP: Record<ImportedWorkout['activityType'], ActivityType> = {
  running: 'run',
  walking: 'walk',
  cycling: 'cycle',
  other: 'generic_cardio',
};

export type ImportResult = {
  inserted: number;
  duplicates: number;
  rejected: Array<{ sourceUuid: string; reason: string }>;
  workouts: Array<{ sessionId: number; activity: ActivityType; kcal: number | null; distanceM: number; durationS: number; avgHrBpm: number | null }>;
};

/**
 * Pull новые тренировки из активного HealthAdapter и записать в sessions.
 * Дедуп по UNIQUE (source, external_uuid) (см. database.ts v16).
 *
 * Не начисляет монеты — это задача caller'а (после import пройтись по
 * `result.workouts` и вызвать `useWalletStore.awardForSession` per row).
 */
export async function importFromAdapter(sinceMs: number | null): Promise<ImportResult> {
  const adapter = getHealthAdapter();
  const list = await adapter.pullSince(sinceMs);
  const db = getDatabase();
  const platform = adapter.platform();
  const result: ImportResult = {
    inserted: 0,
    duplicates: 0,
    rejected: [],
    workouts: [],
  };

  for (const w of list) {
    const why = checkWorkoutSanity(w);
    if (why !== null) {
      result.rejected.push({ sourceUuid: w.sourceUuid, reason: why });
      continue;
    }
    const sessionId = w.startedAt; // id = startedAt (см. sessionRepository.createSession)
    const activity = ACTIVITY_MAP[w.activityType];
    const durationS = Math.max(0, Math.floor((w.endedAt - w.startedAt) / 1000));
    // INSERT OR IGNORE — если UNIQUE(source, external_uuid) уже занят, skip.
    const before = countSessions(db);
    db.runSync(
      `INSERT OR IGNORE INTO sessions
       (id, started_at, ended_at, is_closed, distance_m, area_m2, calc_method, note,
        avg_hr_bpm, max_hr_bpm, calories_kcal, source, external_uuid, activity_type)
       VALUES (?, ?, ?, 0, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?);`,
      [
        sessionId,
        w.startedAt,
        w.endedAt,
        w.distanceM,
        w.avgHrBpm ?? null,
        w.avgHrBpm ?? null,
        w.calories ?? null,
        platform,
        w.sourceUuid,
        activity,
      ],
    );
    const after = countSessions(db);
    if (after > before) {
      result.inserted += 1;
      result.workouts.push({
        sessionId,
        activity,
        kcal: w.calories ?? null,
        distanceM: w.distanceM,
        durationS,
        avgHrBpm: w.avgHrBpm ?? null,
      });
    } else {
      result.duplicates += 1;
    }
  }

  return result;
}

function countSessions(db: ReturnType<typeof getDatabase>): number {
  const row = db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM sessions;`);
  return row?.n ?? 0;
}
