// Banister Performance Manager Chart: CTL / ATL / TSB.
// ТЗ §6 / Phase 6 / P6-A-03.
//
// CTL (Chronic Training Load) — фитнес. Экспоненциальная скользящая средняя
// дневного TSS с константой времени 42 дня.
// ATL (Acute Training Load) — усталость. Та же формула с константой 7 дней.
// TSB (Training Stress Balance) = CTL - ATL. Положительный — отдохнул, ready;
// отрицательный — устал, перегружен.

const DEFAULT_CTL_TC = 42;
const DEFAULT_ATL_TC = 7;

/**
 * Дневная нагрузка: суммарный TSS всех тренировок этого дня.
 * Ключ — миллисекунды эпоха-полуночи дня (локальное время).
 */
export type DailyTSS = Record<string, number>;

export type PMCPoint = {
  /** Эпоха полуночи дня (локальная TZ). */
  dayMs: number;
  /** Сумма TSS всех тренировок за этот день. */
  tss: number;
  /** Хронический фитнес после этого дня. */
  ctl: number;
  /** Острая усталость после этого дня. */
  atl: number;
  /** TSB = ctl - atl. */
  tsb: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Посчитать PMC-кривую на интервале [startMs, endMs].
 * Дни без тренировки считаются как TSS=0 (важно для затухания).
 *
 * @param dailyTss — карта day-ms → суммарный TSS
 * @param startMs — начало интервала (эпоха полуночи)
 * @param endMs — конец (эксклюзивно, эпоха полуночи)
 * @param ctlTc — константа времени CTL (дни). По умолчанию 42.
 * @param atlTc — то же для ATL. По умолчанию 7.
 * @param ctl0 — начальный CTL (если пользователь продолжает после паузы).
 * @param atl0 — начальный ATL.
 */
export function computePMC(
  dailyTss: DailyTSS,
  startMs: number,
  endMs: number,
  options: {
    ctlTc?: number;
    atlTc?: number;
    ctl0?: number;
    atl0?: number;
  } = {},
): PMCPoint[] {
  const ctlTc = options.ctlTc ?? DEFAULT_CTL_TC;
  const atlTc = options.atlTc ?? DEFAULT_ATL_TC;
  const ctlAlpha = 1 / ctlTc;
  const atlAlpha = 1 / atlTc;

  let ctl = options.ctl0 ?? 0;
  let atl = options.atl0 ?? 0;
  const result: PMCPoint[] = [];

  for (let day = startMs; day < endMs; day += DAY_MS) {
    const tss = dailyTss[String(day)] ?? 0;
    // Канонические рекуррентные формулы:
    //   CTL_today = CTL_yesterday + (TSS_today - CTL_yesterday) × (1/42)
    //   ATL_today = ATL_yesterday + (TSS_today - ATL_yesterday) × (1/7)
    ctl = ctl + (tss - ctl) * ctlAlpha;
    atl = atl + (tss - atl) * atlAlpha;
    result.push({
      dayMs: day,
      tss,
      ctl,
      atl,
      tsb: ctl - atl,
    });
  }
  return result;
}

/**
 * Группировка sessions по дням для подачи в computePMC.
 * Ожидает что у sessions есть startedAt + (предвычисленный) tss.
 */
export function buildDailyTSS(
  sessions: readonly { startedAt: number; tss: number | null }[],
): DailyTSS {
  const map: DailyTSS = {};
  for (const s of sessions) {
    if (s.tss === null) continue;
    const d = new Date(s.startedAt);
    const dayMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const key = String(dayMs);
    map[key] = (map[key] ?? 0) + s.tss;
  }
  return map;
}

/**
 * Интерпретация TSB для подсказок UI.
 * Согласно общепринятым диапазонам TrainingPeaks.
 */
export function tsbZone(tsb: number): {
  zone: 'fresh' | 'optimal' | 'neutral' | 'fatigued' | 'overreached';
  hint: string;
} {
  if (tsb > 25) return { zone: 'fresh', hint: 'Свежий — можно гонять, но недотренированность' };
  if (tsb > 5) return { zone: 'optimal', hint: 'Оптимальная форма — гоночный таперинг' };
  if (tsb > -10) return { zone: 'neutral', hint: 'Нейтральная зона — можно тренироваться' };
  if (tsb > -30) return { zone: 'fatigued', hint: 'Накопилась усталость — снижай нагрузку' };
  return { zone: 'overreached', hint: 'Перетренированность — день-два отдыха' };
}
