// Lap — manual lap-mark во время записи. Phase 2 / Round 2.
//
// В отличие от автоматических per-km splits (см. domain/splits.ts), lap'ы
// маркируются пользователем кнопкой «Круг» на TrackerLive.
//
// Pure functions: никакой БД, никаких сайд-эффектов.

import type { Point } from './types';
import { haversineDistance } from '../util/geo';

export type Lap = {
  /** 1-based порядковый номер lap'а в сессии. */
  lapNumber: number;
  /** Стартовое время lap'а (ms epoch). */
  startedAt: number;
  /** Конечное время lap'а (ms epoch). */
  endedAt: number;
  /** Дистанция lap'а в метрах. */
  distanceM: number;
  /** Длительность в секундах. */
  durationS: number;
  /** Темп в мин/км, null если distanceM=0. */
  paceMinKm: number | null;
  /** Средний HR за lap, null если HR данных нет. */
  avgHrBpm: number | null;
};

export type LapInput = Point & { hrBpm?: number | null };

/**
 * Посчитать метрики lap'а от индекса `fromIdx` до конца массива `points`.
 * Возвращает null, если в окне нет ≥ 2 точек.
 */
export function lapFromRange(
  points: readonly LapInput[],
  fromIdx: number,
  lapNumber: number,
): Lap | null {
  if (fromIdx < 0 || fromIdx >= points.length - 1) return null;
  let dist = 0;
  let hrSum = 0;
  let hrCount = 0;
  for (let i = fromIdx + 1; i < points.length; i++) {
    dist += haversineDistance(points[i - 1], points[i]);
    const hr = points[i].hrBpm;
    if (typeof hr === 'number' && Number.isFinite(hr)) {
      hrSum += hr;
      hrCount += 1;
    }
  }
  const startedAt = points[fromIdx].timestamp;
  const endedAt = points[points.length - 1].timestamp;
  const durationS = Math.max(0, (endedAt - startedAt) / 1000);
  if (durationS <= 0) return null;
  const paceMinKm = dist > 0 ? durationS / 60 / (dist / 1000) : null;
  return {
    lapNumber,
    startedAt,
    endedAt,
    distanceM: dist,
    durationS: Math.round(durationS),
    paceMinKm,
    avgHrBpm: hrCount > 0 ? hrSum / hrCount : null,
  };
}

/**
 * Самый быстрый и самый медленный lap по pace. Возвращает lap_number'ы.
 * Игнорирует lap'ы с null pace или distance < 100m (анти-noise).
 */
export function fastestAndSlowestLap(laps: readonly Lap[]): {
  fastest: number | null;
  slowest: number | null;
} {
  const valid = laps.filter(
    (l) => l.paceMinKm !== null && l.distanceM >= 100,
  );
  if (valid.length === 0) return { fastest: null, slowest: null };
  let fastest = valid[0];
  let slowest = valid[0];
  for (const l of valid) {
    if (l.paceMinKm! < fastest.paceMinKm!) fastest = l;
    if (l.paceMinKm! > slowest.paceMinKm!) slowest = l;
  }
  return { fastest: fastest.lapNumber, slowest: slowest.lapNumber };
}
