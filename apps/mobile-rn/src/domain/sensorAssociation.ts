// Ассоциация sensor-readings с точками трека.
// ТЗ §4.2 — Point получает HR через ближайший по времени HR-sample (если разница
// меньше threshold). Phase 5 / P5-A-06.

import type { SensorReading } from '../sensors/SensorAdapter';
import type { EnrichedPoint, Point } from './types';

const DEFAULT_MAX_GAP_MS = 5_000;

/**
 * Прикрепить ближайший HR-sample к каждой точке. Если ближайший
 * sample дальше maxGapMs — hrBpm остаётся null.
 *
 * Сложность O(n + m) — readings отсортированы по времени, идём указателем.
 */
export function associateHrToPoints(
  points: readonly Point[],
  readings: readonly SensorReading[],
  options: { maxGapMs?: number } = {},
): EnrichedPoint[] {
  const maxGap = options.maxGapMs ?? DEFAULT_MAX_GAP_MS;
  const hr = readings.filter((r) => r.type === 'hr');
  let j = 0;

  return points.map((p): EnrichedPoint => {
    // Двигаем j вперёд пока следующий reading ближе к точке.
    while (
      j + 1 < hr.length &&
      Math.abs(hr[j + 1].timestamp - p.timestamp) <
        Math.abs(hr[j].timestamp - p.timestamp)
    ) {
      j += 1;
    }
    const nearest = hr[j];
    const hrBpm =
      nearest && Math.abs(nearest.timestamp - p.timestamp) <= maxGap
        ? Math.round(nearest.value)
        : null;
    return { ...p, hrBpm, cadenceRpm: null, powerW: null };
  });
}
