// Caloric estimation.
// Phase 6.5+ / Round 2 (sport-agnostic).
//
// Используем MET (Metabolic Equivalent of Task) — стандартный метод для
// аэробных упражнений. Compendium of Physical Activities (Ainsworth 2011)
// даёт MET-коэффициенты для разных типов нагрузки.
//
// Формула: kcal = MET × вес_кг × часы
//
// Точность ≈ ±15%. Для real measurement нужен HR-based — см. caloriesFromHr().

import type { ActivityType } from './types';
import type { AthleteProfile, Sex } from './athlete';

type MetPoint = [number, number]; // [pace_min_per_km, met]

// Compendium codes 12030+: running.
const RUN_TABLE: MetPoint[] = [
  [9.0, 5.0],
  [8.0, 6.0],
  [7.0, 7.0],
  [6.0, 8.3],
  [5.5, 9.0],
  [5.0, 9.8],
  [4.5, 11.0],
  [4.0, 12.8],
  [3.5, 14.5],
  [3.0, 16.0],
  [2.5, 18.0],
];

// Trail running — slight bump for terrain.
const TRAIL_TABLE: MetPoint[] = RUN_TABLE.map(([p, m]) => [p, m * 1.05]);

// Compendium codes 17xxx: walking.
const WALK_TABLE: MetPoint[] = [
  [20.0, 2.0],   // slow stroll
  [15.0, 2.5],
  [12.0, 3.0],
  [10.0, 3.5],   // ~6 km/h
  [9.0, 4.3],    // brisk
  [8.0, 5.0],    // very brisk
  [7.0, 6.3],    // race-walk
];

// Compendium codes 010xx: cycling. Cycling использует speed (km/h),
// конвертируем через "pace" как мин/км для совместимости интерфейса
// (1км / speed_kmh × 60).
const CYCLE_TABLE: MetPoint[] = [
  [6.0, 4.0],   // ~10 km/h — leisure
  [4.0, 6.8],   // ~15 km/h
  [3.0, 8.0],   // ~20 km/h
  [2.4, 10.0],  // ~25 km/h
  [2.0, 12.0],  // ~30 km/h — brisk
  [1.7, 14.0],  // ~35 km/h — racing
  [1.5, 16.0],  // ~40 km/h
];

// Compendium 02050: treadmill, generic settings.
const TREADMILL_TABLE: MetPoint[] = [
  [10.0, 3.0],   // 6 km/h
  [8.0, 5.0],
  [6.0, 7.0],
  [5.0, 8.5],
  [4.0, 11.0],
];

// Generic moderate cardio (если activity не распознан).
const GENERIC_CARDIO_TABLE: MetPoint[] = [
  [8.0, 5.0],
  [4.0, 7.0],
  [2.0, 9.0],
];

/** Линейная интерполяция между точками таблицы. Pace=null/0 → fallback из таблицы. */
function metFromTable(paceMinKm: number, table: MetPoint[]): number {
  if (!Number.isFinite(paceMinKm) || paceMinKm <= 0) {
    return table[0][1];
  }
  if (paceMinKm >= table[0][0]) return table[0][1];
  if (paceMinKm <= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 1; i < table.length; i++) {
    const [p1, m1] = table[i - 1];
    const [p2, m2] = table[i];
    if (paceMinKm <= p1 && paceMinKm >= p2) {
      const t = (p1 - paceMinKm) / (p1 - p2);
      return m1 + t * (m2 - m1);
    }
  }
  return table[Math.floor(table.length / 2)][1];
}

const TABLES: Record<ActivityType, MetPoint[]> = {
  run: RUN_TABLE,
  trail: TRAIL_TABLE,
  walk: WALK_TABLE,
  cycle: CYCLE_TABLE,
  treadmill: TREADMILL_TABLE,
  generic_cardio: GENERIC_CARDIO_TABLE,
};

/** Оценка калорий через MET-таблицу, выбираемую по типу активности. */
export function estimateCaloriesForActivity(
  activity: ActivityType,
  weightKg: number | null,
  durationS: number,
  distanceM: number,
): number | null {
  if (weightKg === null || !Number.isFinite(weightKg) || weightKg <= 0) return null;
  if (durationS <= 0) return null;
  const table = TABLES[activity];
  if (distanceM <= 0) {
    // Без дистанции — берём базовый (низкий) MET таблицы. Консервативно:
    // лучше недосчитать, чем переоценить.
    const baseMet = table[0][1];
    return Math.round(baseMet * weightKg * (durationS / 3600));
  }
  const paceMinKm = (durationS / 60) / (distanceM / 1000);
  const met = metFromTable(paceMinKm, table);
  return Math.round(met * weightKg * (durationS / 3600));
}

/** Backward-compat: оценка для running, если activity ещё не известен. */
export function estimateCaloriesRun(
  weightKg: number | null,
  durationS: number,
  distanceM: number,
): number | null {
  return estimateCaloriesForActivity('run', weightKg, durationS, distanceM);
}

// ─────────────────────────────────────────────────────────────
// HR-based calories (Keytel 2005 formula).
// ─────────────────────────────────────────────────────────────

/**
 * Оценка калорий на основе среднего HR + базовой биометрии.
 *
 * Источник: Keytel L. R. et al. (2005). "Prediction of energy expenditure
 * from heart rate monitoring during submaximal exercise." J Sports Sci.
 *
 * Формула (kcal/min):
 *   мужчины:  (-55.0969 + 0.6309×HR + 0.1988×W + 0.2017×A) / 4.184
 *   женщины:  (-20.4022 + 0.4472×HR − 0.1263×W + 0.074×A) / 4.184
 *
 * где W — вес кг, A — возраст лет.
 *
 * Требует HR + вес + возраст + пол. Если что-то отсутствует — null.
 */
export function caloriesFromHr(
  avgHrBpm: number | null,
  durationS: number,
  athlete: AthleteProfile,
): number | null {
  if (avgHrBpm === null || !Number.isFinite(avgHrBpm) || avgHrBpm < 30 || avgHrBpm > 230) {
    return null;
  }
  if (durationS <= 0) return null;
  const weightKg = athlete.weightKg ?? null;
  if (weightKg === null || weightKg <= 0) return null;
  const sex = athlete.sex;
  const age = ageFromBirth(athlete.birthDate);
  if (sex === null || age === null) return null;

  const minutes = durationS / 60;
  const perMin = sex === 'female'
    ? (-20.4022 + 0.4472 * avgHrBpm - 0.1263 * weightKg + 0.074 * age) / 4.184
    : (-55.0969 + 0.6309 * avgHrBpm + 0.1988 * weightKg + 0.2017 * age) / 4.184;
  const kcal = perMin * minutes;
  if (!Number.isFinite(kcal) || kcal <= 0) return null;
  return Math.round(kcal);
}

function ageFromBirth(birthDate: string | null): number | null {
  if (birthDate === null) return null;
  const ms = Date.parse(birthDate);
  if (!Number.isFinite(ms)) return null;
  const years = (Date.now() - ms) / (365.2425 * 24 * 3600 * 1000);
  if (years < 5 || years > 100) return null;
  return Math.floor(years);
}

/**
 * Best-effort: предпочитаем HR-based если есть полная биометрия + HR,
 * иначе MET-based по pace.
 */
export function estimateCaloriesBest(
  activity: ActivityType,
  athlete: AthleteProfile,
  avgHrBpm: number | null,
  durationS: number,
  distanceM: number,
): number | null {
  const hrCal = caloriesFromHr(avgHrBpm, durationS, athlete);
  if (hrCal !== null) return hrCal;
  return estimateCaloriesForActivity(activity, athlete.weightKg ?? null, durationS, distanceM);
}

export type { Sex };
