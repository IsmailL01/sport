// Personal records — pure functions. Phase 8 / M10.1.
//
// Никаких сайд-эффектов, никакой БД. Только расчёты, тестируемые
// отдельно (см. __tests__/records.test.ts).

import type { Point } from './types';
import { haversineDistance } from '../util/geo';

export type RecordKind =
  | 'longest_distance'   // дистанция, m
  | 'longest_duration'   // время, s
  | 'best_pace_1km'      // min/km, lower = better
  | 'best_pace_5km'      // min/km, lower = better
  | 'best_pace_10km'     // min/km, lower = better
  | 'most_calories'      // kcal
  | 'max_avg_speed';     // km/h

export type PersonalRecord = {
  kind: RecordKind;
  value: number;
  sessionId: number;
  achievedAt: number;
  /** Старое значение перед побитием (для UI дельты). null если первый раз. */
  prevValue: number | null;
};

export type SessionMetrics = {
  sessionId: number;
  startedAt: number;
  endedAt: number;
  distanceM: number;
  durationS: number;
  caloriesKcal: number | null;
};

/**
 * Сравнение «лучше»: для pace меньше = лучше, для всего остального
 * больше = лучше.
 */
export function isBetter(kind: RecordKind, candidate: number, current: number | null): boolean {
  if (current === null) return true;
  if (!Number.isFinite(candidate)) return false;
  if (kind === 'best_pace_1km' || kind === 'best_pace_5km' || kind === 'best_pace_10km') {
    return candidate < current;
  }
  return candidate > current;
}

/**
 * Best pace over a fixed sliding window of points covering at least
 * `targetMeters` distance. Pace в min/km.
 *
 * Алгоритм: двойной указатель. Перемещаем `right`, накопительно
 * считая дистанцию. Когда покрыли targetMeters — сдвигаем `left`
 * чтобы окно было минимально-возможным >= targetMeters; берём pace
 * = duration / (distance/1000). Min pace по всем окнам.
 *
 * Возвращает null если в точках нет окна с distance >= targetMeters.
 */
export function bestPaceForDistance(points: readonly Point[], targetMeters: number): number | null {
  if (points.length < 2 || targetMeters <= 0) return null;
  // Cumulative distance lookup для O(n) перемещения окна.
  const cum: number[] = new Array(points.length).fill(0);
  for (let i = 1; i < points.length; i++) {
    cum[i] = cum[i - 1] + haversineDistance(points[i - 1], points[i]);
  }
  // 1% tolerance: GPS-точки шумят, 999.5m по факту = 1km для пользователя.
  const minDist = targetMeters * 0.99;
  let best: number | null = null;
  let left = 0;
  for (let right = 1; right < points.length; right++) {
    const dist = cum[right] - cum[left];
    if (dist < minDist) continue;
    // Двигаем left вперёд пока окно остаётся >= minDist.
    while (left + 1 < right && cum[right] - cum[left + 1] >= minDist) {
      left++;
    }
    const windowDist = cum[right] - cum[left];
    const windowDurS = (points[right].timestamp - points[left].timestamp) / 1000;
    if (windowDist <= 0 || windowDurS <= 0) continue;
    const paceMinPerKm = windowDurS / 60 / (windowDist / 1000);
    if (!Number.isFinite(paceMinPerKm) || paceMinPerKm <= 0) continue;
    if (best === null || paceMinPerKm < best) {
      best = paceMinPerKm;
    }
  }
  return best;
}

/**
 * Среднее по сессии: km/h из distance/duration.
 */
export function avgSpeedKmh(session: SessionMetrics): number | null {
  if (session.distanceM <= 0 || session.durationS <= 0) return null;
  return (session.distanceM / 1000) / (session.durationS / 3600);
}

/**
 * Сравнить candidates сессии с current best для каждого RecordKind.
 * Возвращает только улучшения (kind, newValue, prevValue).
 */
export function detectNewRecords(
  session: SessionMetrics,
  points: readonly Point[],
  current: Partial<Record<RecordKind, number>>,
): Array<{ kind: RecordKind; value: number; prevValue: number | null }> {
  const out: Array<{ kind: RecordKind; value: number; prevValue: number | null }> = [];

  // Longest distance
  if (session.distanceM > 0 && isBetter('longest_distance', session.distanceM, current.longest_distance ?? null)) {
    out.push({ kind: 'longest_distance', value: session.distanceM, prevValue: current.longest_distance ?? null });
  }

  // Longest duration
  if (session.durationS > 0 && isBetter('longest_duration', session.durationS, current.longest_duration ?? null)) {
    out.push({ kind: 'longest_duration', value: session.durationS, prevValue: current.longest_duration ?? null });
  }

  // Best pace per distance window
  const p1 = bestPaceForDistance(points, 1000);
  if (p1 !== null && isBetter('best_pace_1km', p1, current.best_pace_1km ?? null)) {
    out.push({ kind: 'best_pace_1km', value: p1, prevValue: current.best_pace_1km ?? null });
  }
  const p5 = bestPaceForDistance(points, 5000);
  if (p5 !== null && isBetter('best_pace_5km', p5, current.best_pace_5km ?? null)) {
    out.push({ kind: 'best_pace_5km', value: p5, prevValue: current.best_pace_5km ?? null });
  }
  const p10 = bestPaceForDistance(points, 10000);
  if (p10 !== null && isBetter('best_pace_10km', p10, current.best_pace_10km ?? null)) {
    out.push({ kind: 'best_pace_10km', value: p10, prevValue: current.best_pace_10km ?? null });
  }

  // Calories
  if (session.caloriesKcal !== null && session.caloriesKcal > 0
      && isBetter('most_calories', session.caloriesKcal, current.most_calories ?? null)) {
    out.push({ kind: 'most_calories', value: session.caloriesKcal, prevValue: current.most_calories ?? null });
  }

  // Avg speed
  const avg = avgSpeedKmh(session);
  if (avg !== null && isBetter('max_avg_speed', avg, current.max_avg_speed ?? null)) {
    out.push({ kind: 'max_avg_speed', value: avg, prevValue: current.max_avg_speed ?? null });
  }

  return out;
}

/** Human-readable label по kind — для UI. */
export const RECORD_LABELS: Record<RecordKind, string> = {
  longest_distance: 'Самая длинная дистанция',
  longest_duration: 'Самая долгая тренировка',
  best_pace_1km: 'Лучший темп на 1 км',
  best_pace_5km: 'Лучший темп на 5 км',
  best_pace_10km: 'Лучший темп на 10 км',
  most_calories: 'Больше всего калорий',
  max_avg_speed: 'Максимальная средняя скорость',
};

/** Иконка из design system для kind. */
export const RECORD_ICONS: Record<RecordKind, string> = {
  longest_distance: 'run',
  longest_duration: 'stopwatch',
  best_pace_1km: 'pace',
  best_pace_5km: 'pace',
  best_pace_10km: 'pace',
  most_calories: 'flame',
  max_avg_speed: 'bolt',
};
