// Training Stress Score calculations.
// ТЗ §6 / Phase 6 / P6-A-02.
//
// TSS — мера тренировочной нагрузки. Канонические варианты:
//
//  1. hrTSS (TRIMP-подобный) — на основе времени в зонах относительно LTHR.
//     TSS = (duration_h × HR_avg × intensity_factor²) × 100, где
//     intensity_factor = HR_avg / LTHR.
//     Простая, не требует power-meter. Чувствительна к LTHR точности.
//
//  2. rTSS — running TSS на основе среднего темпа vs LTHR pace:
//     IF = LTHR_pace / avg_pace (быстрее → больше IF)
//     TSS = (duration_h × IF²) × 100
//     Используется в TrainingPeaks / Strava.
//
// Phase 6 реализует оба. Phase 7 добавит стандартный TSS (power-based) когда
// будет Stryd / running power.

import type { RawPoint } from '../types';

/**
 * Heart-rate based TSS (TRIMP-подобный, упрощённая формула Phil Skiba).
 *
 * @param avgHrBpm — средний HR за тренировку
 * @param lthrBpm — Lactate Threshold HR пользователя
 * @param durationS — длительность тренировки в секундах
 * @returns TSS (0..400+ за 60-мин гонку), null если данных недостаточно
 */
export function computeHrTSS(
  avgHrBpm: number | null,
  lthrBpm: number | null,
  durationS: number,
): number | null {
  if (avgHrBpm === null || lthrBpm === null || lthrBpm <= 0) return null;
  if (durationS <= 0) return null;
  const intensityFactor = avgHrBpm / lthrBpm;
  const hours = durationS / 3600;
  return Math.round(hours * intensityFactor * intensityFactor * 100);
}

/**
 * Running TSS на основе среднего темпа.
 *
 * @param avgPaceMinKm — средний темп в мин/км (меньше = быстрее)
 * @param lthrPaceMinKm — LTHR pace пользователя
 * @param durationS — длительность в секундах
 * @returns rTSS, null если данных недостаточно
 */
export function computeRTSS(
  avgPaceMinKm: number | null,
  lthrPaceMinKm: number | null,
  durationS: number,
): number | null {
  if (avgPaceMinKm === null || avgPaceMinKm <= 0) return null;
  if (lthrPaceMinKm === null || lthrPaceMinKm <= 0) return null;
  if (durationS <= 0) return null;
  // Темп инвертируется (быстрее = меньше число → больше IF).
  const intensityFactor = lthrPaceMinKm / avgPaceMinKm;
  const hours = durationS / 3600;
  return Math.round(hours * intensityFactor * intensityFactor * 100);
}

/**
 * Best-effort TSS: предпочитает HR-based если есть LTHR + HR-данные,
 * иначе fallback на rTSS.
 */
export function bestTSS(args: {
  avgHrBpm: number | null;
  lthrBpm: number | null;
  avgPaceMinKm: number | null;
  lthrPaceMinKm: number | null;
  durationS: number;
}): { value: number; method: 'hr' | 'pace' } | null {
  const hr = computeHrTSS(args.avgHrBpm, args.lthrBpm, args.durationS);
  if (hr !== null) return { value: hr, method: 'hr' };
  const pace = computeRTSS(args.avgPaceMinKm, args.lthrPaceMinKm, args.durationS);
  if (pace !== null) return { value: pace, method: 'pace' };
  return null;
}

/** Средний HR из массива HR-readings. null если массив пуст. */
export function averageHr(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

/** Средний темп из дистанции и времени. null если distance == 0. */
export function averagePaceFromTotals(distanceM: number, durationS: number): number | null {
  if (distanceM <= 0 || durationS <= 0) return null;
  return durationS / 60 / (distanceM / 1000);
}

/** Маркер «есть достаточно точек чтобы считать TSS». */
export function hasEnoughDataForTSS(durationS: number, points: readonly RawPoint[]): boolean {
  return durationS >= 60 && points.length >= 5;
}
