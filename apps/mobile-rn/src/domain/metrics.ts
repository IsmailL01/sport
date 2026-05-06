// Live-метрики трека: скорость (sliding window), темп, калории.
// Чистые функции — легко тестировать (см. __tests__/metrics.test.ts).

import type { RawPoint } from './types';
import { haversineDistance } from '../util/geo';

const SPEED_WINDOW_MS = 10_000;
const PACE_MIN_SPEED_MS = 0.5;

/**
 * Текущая скорость в м/с по скользящему окну 10 секунд (ТЗ §6.3 / FR-008).
 * Возвращает 0 если меньше 2 точек или если окно пустое.
 */
export function currentSpeed(points: readonly RawPoint[]): number {
  const n = points.length;
  if (n < 2) return 0;
  const lastTs = points[n - 1].timestamp;
  const cutoff = lastTs - SPEED_WINDOW_MS;

  // Найти первый индекс ts >= cutoff
  let startIdx = n - 1;
  for (let i = n - 1; i >= 0; i -= 1) {
    if (points[i].timestamp >= cutoff) {
      startIdx = i;
    } else {
      break;
    }
  }
  if (startIdx >= n - 1) return 0;

  let dist = 0;
  for (let i = startIdx + 1; i < n; i += 1) {
    dist += haversineDistance(points[i - 1], points[i]);
  }
  const dtSec = (lastTs - points[startIdx].timestamp) / 1000;
  if (dtSec <= 0) return 0;
  return dist / dtSec;
}

/**
 * Темп min/km, null если скорость ниже порога (ТЗ §6.3 / FR-009).
 * При v < 0.5 м/с темп уходит в бесконечность — UI должен скрывать.
 */
export function currentPace(speedMs: number): number | null {
  if (speedMs < PACE_MIN_SPEED_MS) return null;
  return 1000 / speedMs / 60;
}

/**
 * Калории по упрощённой формуле для бега (ТЗ §6, FR-005 калорий).
 * weight * distance_km * 1.036 — даёт оценку на ±20%, для прототипа достаточно.
 * Точная формула с MET — Phase 6 / Training Engine.
 */
export function calculateCalories(weightKg: number, distanceM: number): number {
  return weightKg * (distanceM / 1000) * 1.036;
}
