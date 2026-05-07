// Caloric estimation для бега.
// Phase 6.5+ / extra.
//
// Используем MET (Metabolic Equivalent of Task) — стандартный метод для
// аэробных упражнений. Compendium of Physical Activities (Ainsworth 2011)
// даёт MET-коэффициенты для бега в зависимости от темпа.
//
// Формула: kcal = MET × вес_кг × часы
//
// Точность ≈ ±15%. Для real measurement нужен HR-based / power-based;
// здесь — приближение которое лучше чем ничего.

/**
 * MET для бега в зависимости от темпа (мин/км).
 * Cubic interpolation между точками таблицы Compendium.
 */
function metForRunPace(paceMinKm: number): number {
  if (!Number.isFinite(paceMinKm) || paceMinKm <= 0) return 0;
  // Таблица: pace мин/км → MET (Compendium of Physical Activities, codes 12030+).
  // Pace 8:00 → 6.0 MET (jog)
  // Pace 7:00 → 7.0
  // Pace 6:00 → 8.3
  // Pace 5:30 → 9.0
  // Pace 5:00 → 9.8
  // Pace 4:30 → 11.0
  // Pace 4:00 → 12.8
  // Pace 3:30 → 14.5
  // Pace 3:00 → 16.0
  const table: Array<[number, number]> = [
    [9.0, 5.0],   // very slow jog
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
  // Если темп быстрее верхней границы или медленнее нижней — clamp.
  if (paceMinKm >= table[0][0]) return table[0][1];
  if (paceMinKm <= table[table.length - 1][0]) return table[table.length - 1][1];
  // Линейная интерполяция между ближайшими точками.
  for (let i = 1; i < table.length; i++) {
    const [p1, m1] = table[i - 1];
    const [p2, m2] = table[i];
    if (paceMinKm <= p1 && paceMinKm >= p2) {
      const t = (p1 - paceMinKm) / (p1 - p2);
      return m1 + t * (m2 - m1);
    }
  }
  return 8.0; // safety default
}

/**
 * Оценить сожжённые калории для бега.
 *
 * @param weightKg — вес атлета в кг (если не задан → возвращает null)
 * @param durationS — длительность в секундах
 * @param distanceM — пройденная дистанция в метрах
 * @returns kcal или null если данных недостаточно
 */
export function estimateCaloriesRun(
  weightKg: number | null,
  durationS: number,
  distanceM: number,
): number | null {
  if (weightKg === null || !Number.isFinite(weightKg) || weightKg <= 0) return null;
  if (durationS <= 0) return null;
  if (distanceM <= 0) {
    // Нет дистанции — используем низкий MET для общей активности (jog).
    const hours = durationS / 3600;
    return Math.round(5.0 * weightKg * hours);
  }
  const paceMinKm = (durationS / 60) / (distanceM / 1000);
  const met = metForRunPace(paceMinKm);
  const hours = durationS / 3600;
  return Math.round(met * weightKg * hours);
}
