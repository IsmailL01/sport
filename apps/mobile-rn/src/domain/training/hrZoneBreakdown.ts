// Time-in-zone breakdown по HR samples сессии.
// Phase 6.5 / extra.

import { defaultHRZones, type HRZone } from '../athlete';

export type HrSample = {
  ts: number;
  bpm: number;
};

export type ZoneBreakdownEntry = {
  zone: HRZone;
  /** Секунды, проведённые в этой зоне. */
  durationS: number;
  /** Доля от общего времени тренировки [0..1]. */
  fraction: number;
};

/**
 * Посчитать сколько времени HR провёл в каждой зоне.
 *
 * Алгоритм: для каждой пары соседних samples — длительность интервала
 * между ними, его HR оцениваем как среднее (BPM(prev)+BPM(curr))/2,
 * относим в зону этого среднего.
 *
 * Если samples меньше 2 — возвращает пустой массив.
 */
export function computeHrZoneBreakdown(
  samples: readonly HrSample[],
  maxHR: number,
): ZoneBreakdownEntry[] {
  if (samples.length < 2) return [];
  if (!Number.isFinite(maxHR) || maxHR <= 0) return [];

  const zones = defaultHRZones(maxHR);
  const totalsByZone = new Map<number, number>(); // zone.index → seconds

  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const dtS = (curr.ts - prev.ts) / 1000;
    if (dtS <= 0) continue;
    // Защита от больших интервалов (>30s — sensor отвалился).
    if (dtS > 30) continue;
    const avg = (prev.bpm + curr.bpm) / 2;
    const zone = zones.find((z) => avg >= z.lowerBpm && avg < z.upperBpm)
      // upper boundary (выше Z5) → в Z5 (или последняя зона)
      ?? (avg >= zones[zones.length - 1].upperBpm ? zones[zones.length - 1] : null);
    if (!zone) continue;
    totalsByZone.set(zone.index, (totalsByZone.get(zone.index) ?? 0) + dtS);
  }

  const totalS = Array.from(totalsByZone.values()).reduce((a, b) => a + b, 0);
  if (totalS === 0) return [];

  return zones
    .map((zone) => ({
      zone,
      durationS: totalsByZone.get(zone.index) ?? 0,
      fraction: (totalsByZone.get(zone.index) ?? 0) / totalS,
    }))
    .filter((e) => e.durationS > 0);
}
