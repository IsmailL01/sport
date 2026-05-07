// Профиль атлета и расчёт HR/Pace зон. ТЗ §4.2 Athlete + §7.2 Apple Health.
// В Phase 4 — только базовые поля. Phase 5+ добавит integrate с HealthKit/Health Connect.

export type Sex = 'male' | 'female' | 'other';

export type AthleteProfile = {
  weightKg: number | null;
  heightCm: number | null;
  sex: Sex | null;
  /** ISO date (YYYY-MM-DD). */
  birthDate: string | null;
  restingHR: number | null;
  /** Если null — вычисляется по возрасту через estimateMaxHR. */
  maxHR: number | null;
};

export const emptyAthleteProfile: AthleteProfile = {
  weightKg: 70,
  heightCm: null,
  sex: null,
  birthDate: null,
  restingHR: null,
  maxHR: null,
};

/**
 * Простая формула 220 - age. Точность ±10 уд/мин — для прототипа достаточно.
 * Phase 6 (Training Engine) добавит лучшие модели (Tanaka и т.п.) и LTHR estimation.
 */
export function estimateMaxHR(birthDateIso: string, today: Date = new Date()): number {
  const birth = new Date(birthDateIso);
  if (Number.isNaN(birth.getTime())) return 180;
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  if (age < 10) return 200;
  if (age > 90) return 130;
  return 220 - age;
}

/**
 * Эффективный maxHR — задан пользователем напрямую или вычислен по возрасту.
 * Возвращает null если ни max ни birthDate не заданы.
 */
export function resolveMaxHR(p: AthleteProfile, today: Date = new Date()): number | null {
  if (p.maxHR !== null && p.maxHR > 0) return p.maxHR;
  if (p.birthDate) return estimateMaxHR(p.birthDate, today);
  return null;
}

export type HRZone = {
  index: number; // 1..5
  name: string;
  lowerBpm: number;
  upperBpm: number;
  /** Hex color без альфа-канала. */
  color: string;
};

const ZONE_DEFS: Array<{ index: number; name: string; lowerPct: number; upperPct: number; color: string }> = [
  { index: 1, name: 'Recovery', lowerPct: 0.5, upperPct: 0.6, color: '#94A3B8' },
  { index: 2, name: 'Aerobic', lowerPct: 0.6, upperPct: 0.7, color: '#10B981' },
  { index: 3, name: 'Tempo', lowerPct: 0.7, upperPct: 0.8, color: '#F59E0B' },
  { index: 4, name: 'Threshold', lowerPct: 0.8, upperPct: 0.9, color: '#EF4444' },
  { index: 5, name: 'VO2max', lowerPct: 0.9, upperPct: 1.0, color: '#A855F7' },
];

/**
 * 5 HR-зон по %HRmax (упрощённо без HRR/Karvonen формулы — Phase 6 заменим).
 * ТЗ §7 Sensors / §6 Tracking Engine.
 */
export function defaultHRZones(maxHR: number): HRZone[] {
  return ZONE_DEFS.map((z) => ({
    index: z.index,
    name: z.name,
    lowerBpm: Math.round(maxHR * z.lowerPct),
    upperBpm: Math.round(maxHR * z.upperPct),
    color: z.color,
  }));
}

export type PaceZone = {
  index: number;
  name: string;
  /** Минут на километр (нижняя граница, т.е. БЫСТРЕЕ — меньше число). */
  fasterMinKm: number;
  /** Минут на километр (верхняя, медленнее). */
  slowerMinKm: number;
  color: string;
};

/**
 * Pace-зоны рассчитываются от LTHR pace (lactate threshold pace).
 * Если LTHR pace неизвестен — используется приближение из maxHR через
 * среднюю формулу: LTHR pace ≈ (220 - age) * 0.85 ↔ ~5:30 мин/км для age 30.
 *
 * Phase 6 (Training Engine) добавит точную LTHR estimation из истории треков.
 * Сейчас — грубая оценка только для UI.
 */
export function defaultPaceZones(lthrPaceMinKm: number): PaceZone[] {
  return [
    { index: 1, name: 'Recovery', fasterMinKm: lthrPaceMinKm * 1.20, slowerMinKm: lthrPaceMinKm * 1.50, color: '#94A3B8' },
    { index: 2, name: 'Endurance', fasterMinKm: lthrPaceMinKm * 1.10, slowerMinKm: lthrPaceMinKm * 1.20, color: '#10B981' },
    { index: 3, name: 'Tempo', fasterMinKm: lthrPaceMinKm * 1.00, slowerMinKm: lthrPaceMinKm * 1.10, color: '#F59E0B' },
    { index: 4, name: 'Threshold', fasterMinKm: lthrPaceMinKm * 0.95, slowerMinKm: lthrPaceMinKm * 1.00, color: '#EF4444' },
    { index: 5, name: 'VO2max', fasterMinKm: lthrPaceMinKm * 0.85, slowerMinKm: lthrPaceMinKm * 0.95, color: '#A855F7' },
  ];
}
