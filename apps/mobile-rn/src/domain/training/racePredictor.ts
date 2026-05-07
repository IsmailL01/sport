// Race-time predictor по результатам известного забега.
// Phase 6 / P6-A-07.
//
// Две классические формулы:
//   1. Riegel (1981): T2 = T1 × (D2 / D1)^1.06
//      Простая, хорошо работает на длинах от 5К до марафона.
//   2. Cameron (1998): сложнее, корректирует Riegel для длинных дистанций
//      (формула учитывает падение скорости на длине).
//
// Обе формулы предполагают, что атлет правильно тренирован для целевой
// дистанции — иначе получится оптимистичный прогноз.

const RIEGEL_EXPONENT = 1.06;

/**
 * Riegel race time predictor.
 *
 * @param knownDistanceM — известная дистанция (м), например 5000
 * @param knownTimeS — время на этой дистанции (сек)
 * @param targetDistanceM — желаемая дистанция (м), например 21097.5 (полумарафон)
 * @returns предсказанное время (сек)
 */
export function predictRiegel(
  knownDistanceM: number,
  knownTimeS: number,
  targetDistanceM: number,
): number {
  if (knownDistanceM <= 0 || knownTimeS <= 0 || targetDistanceM <= 0) return 0;
  const ratio = targetDistanceM / knownDistanceM;
  return knownTimeS * Math.pow(ratio, RIEGEL_EXPONENT);
}

/**
 * Cameron race time predictor.
 * Формула: T2 = T1 × (D1 / D2)^a × b, где
 *   a = 13.49681 - 0.000030363 × D1 + 835.7114 / D1^0.7905
 *   b = 1 - corrections (упрощено в реализации, см. Cameron 1998)
 *
 * Используется в реализации Runworld для предсказания марафона по 10K.
 * Формула здесь упрощена; полная требует таблиц коэффициентов.
 *
 * Для прототипа Phase 6 даём быструю аппроксимацию: интерполяция между
 * Riegel (короткие) и более жёстким exponentом (длинные).
 */
export function predictCameron(
  knownDistanceM: number,
  knownTimeS: number,
  targetDistanceM: number,
): number {
  if (knownDistanceM <= 0 || knownTimeS <= 0 || targetDistanceM <= 0) return 0;
  // Эмпирический "exponent" зависит от того, что предсказываем:
  // короткие → Riegel (1.06), длинные → 1.08, очень длинные → 1.10.
  const longerThanKnown = targetDistanceM > knownDistanceM;
  let exp = RIEGEL_EXPONENT;
  if (longerThanKnown) {
    if (targetDistanceM > 30_000) exp = 1.10;
    else if (targetDistanceM > 15_000) exp = 1.08;
  }
  const ratio = targetDistanceM / knownDistanceM;
  return knownTimeS * Math.pow(ratio, exp);
}

/** Стандартные дистанции для UI race-predictor. */
export const STANDARD_DISTANCES_M = [
  { id: '1k', label: '1 км', m: 1000 },
  { id: '5k', label: '5 км', m: 5000 },
  { id: '10k', label: '10 км', m: 10000 },
  { id: 'half', label: 'Полумарафон', m: 21097.5 },
  { id: 'marathon', label: 'Марафон', m: 42195 },
  { id: '50k', label: '50 км', m: 50000 },
  { id: '100k', label: '100 км', m: 100000 },
] as const;

export type StandardDistanceId = (typeof STANDARD_DISTANCES_M)[number]['id'];

/**
 * Темп на дистанции в мин/км из времени в секундах.
 */
export function paceMinKmFromTime(distanceM: number, timeS: number): number | null {
  if (distanceM <= 0 || timeS <= 0) return null;
  return timeS / 60 / (distanceM / 1000);
}
