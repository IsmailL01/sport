// Per-km splits computation.
// Phase 6.5 / extra.
//
// На каждый километр трека: время прохождения, средний темп (мин/км),
// средний HR (если sensor readings есть), элевация-gain.
//
// Алгоритм: бежим по точкам, накапливаем дистанцию между соседними; когда
// сумма пересекает 1000м — splitting. Линейно интерполируем точку пересечения
// чтобы сплит был ровно 1км.

import type { RawPoint } from './types';
import { haversineDistance as haversineDistanceM } from '../util/geo';

export type Split = {
  /** Номер км (1-based). */
  km: number;
  /** Время старта split-а (ms epoch). */
  startedAt: number;
  /** Время финиша split-а (ms epoch). */
  endedAt: number;
  /** Длительность в секундах. */
  durationS: number;
  /** Средний темп в минутах на км. */
  paceMinKm: number;
  /** Средний HR за split, null если HR нет. */
  avgHrBpm: number | null;
  /** Положительная элевация (м), null если нет altitude данных. */
  elevationGainM: number | null;
};

export type SplitInput = RawPoint & { hrBpm?: number | null };

/**
 * Посчитать per-km сплиты для трека.
 * Если последний неполный км ≥ 100м, добавим его как partial split с пометкой.
 */
export function computeSplits(points: readonly SplitInput[]): Split[] {
  if (points.length < 2) return [];
  const splits: Split[] = [];

  let distSinceSplitM = 0;
  let splitStartIdx = 0;
  let splitStartedAt = points[0].timestamp;
  let kmCounter = 1;

  // Накопители для статистики внутри split-а.
  let hrSum = 0;
  let hrCount = 0;
  let elevationGain = 0;
  let hasAltitude = points.some((p) => p.altitude !== null);

  // Учитываем HR/altitude первой точки.
  if (points[0].hrBpm !== null && points[0].hrBpm !== undefined) {
    hrSum += points[0].hrBpm;
    hrCount += 1;
  }

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const segDist = haversineDistanceM(prev, curr);
    distSinceSplitM += segDist;

    if (curr.altitude !== null && prev.altitude !== null) {
      const dAlt = curr.altitude - prev.altitude;
      if (dAlt > 0) elevationGain += dAlt;
    }
    if (curr.hrBpm !== null && curr.hrBpm !== undefined) {
      hrSum += curr.hrBpm;
      hrCount += 1;
    }

    if (distSinceSplitM >= 1000) {
      // Линейная интерполяция: какую долю segment-а пересекли.
      const overshoot = distSinceSplitM - 1000;
      const segNeeded = segDist - overshoot;
      const fraction = segDist > 0 ? segNeeded / segDist : 1;
      const interpolatedTs = prev.timestamp + (curr.timestamp - prev.timestamp) * fraction;
      const durationS = (interpolatedTs - splitStartedAt) / 1000;
      const paceMinKm = durationS > 0 ? durationS / 60 : 0;
      splits.push({
        km: kmCounter,
        startedAt: splitStartedAt,
        endedAt: interpolatedTs,
        durationS,
        paceMinKm,
        avgHrBpm: hrCount > 0 ? Math.round(hrSum / hrCount) : null,
        elevationGainM: hasAltitude ? Math.round(elevationGain) : null,
      });
      // Reset для следующего split-а.
      kmCounter += 1;
      splitStartedAt = interpolatedTs;
      distSinceSplitM = overshoot;
      hrSum = 0;
      hrCount = 0;
      elevationGain = 0;
      // Текущая точка идёт в следующий split с весом overshoot — но для простоты
      // не пересчитываем, только начинаем учитывать с этой же точки.
      if (curr.hrBpm !== null && curr.hrBpm !== undefined) {
        hrSum += curr.hrBpm;
        hrCount += 1;
      }
    }
  }

  // Опциональный partial split за последние 100m+.
  if (distSinceSplitM >= 100) {
    const last = points[points.length - 1];
    const durationS = (last.timestamp - splitStartedAt) / 1000;
    const paceMinKm = durationS > 0 && distSinceSplitM > 0
      ? (durationS / 60) / (distSinceSplitM / 1000)
      : 0;
    splits.push({
      km: kmCounter,
      startedAt: splitStartedAt,
      endedAt: last.timestamp,
      durationS,
      paceMinKm,
      avgHrBpm: hrCount > 0 ? Math.round(hrSum / hrCount) : null,
      elevationGainM: hasAltitude ? Math.round(elevationGain) : null,
    });
  }

  return splits;
}

/**
 * Найти быстрейший и медленнейший сплиты (для подсветки).
 * Игнорирует partial-сплит (последний с distance < 1000m).
 */
export function fastestAndSlowestKm(splits: readonly Split[]): {
  fastestKm: number | null;
  slowestKm: number | null;
} {
  const fullSplits = splits.filter((s) => s.durationS > 0);
  if (fullSplits.length === 0) return { fastestKm: null, slowestKm: null };
  let fastest = fullSplits[0];
  let slowest = fullSplits[0];
  for (const s of fullSplits) {
    if (s.paceMinKm < fastest.paceMinKm) fastest = s;
    if (s.paceMinKm > slowest.paceMinKm) slowest = s;
  }
  return { fastestKm: fastest.km, slowestKm: slowest.km };
}
