// Pure sanity-проверка импортированной активности. Без SQLite — тестируется
// изолированно.
//
// См. docs/INTEGRATIONS.md §6.

import type { ImportedWorkout } from './HealthAdapter';

/** Возвращает причину отказа или null если активность принимается. */
export function checkWorkoutSanity(w: ImportedWorkout): string | null {
  if (!Number.isFinite(w.startedAt) || !Number.isFinite(w.endedAt)) return 'invalid_times';
  const durS = (w.endedAt - w.startedAt) / 1000;
  if (durS <= 0) return 'duration_zero';
  if (durS > 24 * 3600) return 'duration_too_long';
  if (!Number.isFinite(w.distanceM) || w.distanceM < 0) return 'distance_invalid';
  if (w.activityType === 'running' && w.distanceM > 0) {
    const paceMinKm = (durS / 60) / (w.distanceM / 1000);
    if (paceMinKm < 2.5) return 'pace_too_fast';
  }
  if (w.activityType === 'cycling' && w.distanceM > 0) {
    const kmh = (w.distanceM / 1000) / (durS / 3600);
    if (kmh > 100) return 'speed_too_fast';
  }
  if (w.avgHrBpm !== null && w.avgHrBpm !== undefined) {
    if (w.avgHrBpm < 30 || w.avgHrBpm > 230) return 'hr_out_of_range';
  }
  return null;
}
