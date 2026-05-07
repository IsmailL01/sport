// VO2max estimation.
// ТЗ §6 / Phase 6 / P6-A-06.

/**
 * Cooper test (12-минутный run): VO2max ≈ (D - 504.9) / 44.73
 * где D — дистанция в метрах за 12 минут.
 *
 * Самый простой способ оценки — нужен один максимальный 12-минутный бег.
 */
export function vo2maxCooper(distance12MinM: number): number | null {
  if (distance12MinM <= 0) return null;
  return (distance12MinM - 504.9) / 44.73;
}

/**
 * Riegel-derived VO2max из времени на 5K.
 * Формула Daniels: VO2max ≈ -4.6 + 0.182258 × velocity_m/min + 0.000104 × velocity²
 * где velocity = 5000 / time5kS × 60 (м/мин).
 *
 * Альтернатива Cooper если нет 12-минутного теста, но есть 5K результат.
 */
export function vo2maxFrom5K(time5kS: number): number | null {
  if (time5kS <= 0) return null;
  const velocity = (5000 / time5kS) * 60; // м/мин
  return -4.6 + 0.182258 * velocity + 0.000104 * velocity * velocity;
}

/**
 * Категория VO2max по возрасту/полу. Очень упрощённая для UI feedback.
 */
export function vo2maxCategory(
  vo2max: number,
  age: number,
  sex: 'male' | 'female' | 'other' | null,
): 'poor' | 'fair' | 'good' | 'excellent' | 'superior' {
  // Таблицы упрощены — для женщин на ~5 ниже мужских, для пожилых ниже.
  const male = sex !== 'female';
  const baseExcellent = male ? 60 : 55;
  const ageAdj = Math.max(0, age - 30) * 0.4; // -0.4 за каждый год после 30
  const adjusted = vo2max + ageAdj;
  if (adjusted >= baseExcellent + 5) return 'superior';
  if (adjusted >= baseExcellent) return 'excellent';
  if (adjusted >= baseExcellent - 10) return 'good';
  if (adjusted >= baseExcellent - 20) return 'fair';
  return 'poor';
}
