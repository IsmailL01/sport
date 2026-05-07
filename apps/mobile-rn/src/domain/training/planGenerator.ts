// Adaptive training plan generator.
// Phase 9 / P9-A-01.
//
// Идея: на основе текущего PMC (CTL/ATL/TSB) + еженедельной цели по дистанции
// + истории недавних сессий — выдать (а) рекомендацию на сегодня и
// (б) план на 7 дней.
//
// Сейчас: rule-based эвристика. Позже (Phase 9.5+) — ML-модель которая учитывает
// прошлые отклики на нагрузку, предпочтения пользователя, расписание.
//
// Принцип progressive overload: увеличиваем недельный объём не более чем на
// 7% относительно фактического CTL (правило Joe Friel).

import type { PMCPoint } from './banister';
import { tsbZone } from './banister';
import { WORKOUT_LIBRARY, type Workout } from './workout';

export type WorkoutType = 'rest' | 'easy' | 'long' | 'tempo' | 'interval' | 'race_pace';

export type DailyRecommendation = {
  /** Тип тренировки (или отдых). */
  workoutType: WorkoutType;
  /** Целевой TSS для этого дня (приближение, ±20% — норма). */
  targetTss: number;
  /** Краткое объяснение (1 строка). */
  rationale: string;
  /** Подобранный workout из библиотеки если есть. */
  suggestedWorkout: Workout | null;
};

export type WeeklyPlanDay = {
  /** Дата (Unix epoch ms, начало суток). */
  date: number;
  /** День недели 0-6 (0=понедельник). */
  dayOfWeek: number;
  recommendation: DailyRecommendation;
};

export type WeeklyPlan = {
  /** Дата начала недели (понедельник, начало суток). */
  weekStart: number;
  /** Целевой суммарный TSS на неделю. */
  totalTargetTss: number;
  days: WeeklyPlanDay[];
};

/**
 * Рекомендация на сегодня.
 *
 * Вход:
 *   pmc — последние 7+ дней PMC (последний элемент = сегодня)
 *   weeklyDistanceKmGoal — цель пользователя; null = нет цели
 */
export function recommendToday(input: {
  pmc: readonly PMCPoint[];
  /** Целевой недельный объём в км (опционально, для масштаба TSS). */
  weeklyDistanceKmGoal: number | null;
  /** День недели сегодня, 0=понедельник. */
  dayOfWeek: number;
  /** TSS, накопленный за эту неделю до сегодня (для «догнать недельный таргет»). */
  weeklyTssSoFar: number;
}): DailyRecommendation {
  const last = input.pmc[input.pmc.length - 1] ?? { ctl: 0, atl: 0, tsb: 0, tss: 0, dayMs: 0 };
  const tsb = last.tsb;
  const ctl = last.ctl;
  const zone = tsbZone(tsb);

  // Целевой недельный TSS — используем CTL × 7 как фактический объём поддержки,
  // плюс 5% прирост если weekly goal задан.
  const weeklyTargetTss = ctl > 0 ? Math.round(ctl * 7 * 1.05) : (input.weeklyDistanceKmGoal ?? 0) * 6;
  const remainingTss = Math.max(0, weeklyTargetTss - input.weeklyTssSoFar);
  // Сколько дней осталось в неделе (включая сегодня).
  const daysLeft = 7 - input.dayOfWeek;
  const avgPerRemainingDay = daysLeft > 0 ? remainingTss / daysLeft : 0;

  // Если форма очень плохая — рест.
  if (zone.zone === 'overreached') {
    return {
      workoutType: 'rest',
      targetTss: 0,
      rationale: 'Высокая усталость. Сегодня — отдых или очень лёгкая прогулка.',
      suggestedWorkout: null,
    };
  }
  // Если форма очень свежая — можно intensity.
  if (zone.zone === 'fresh' && tsb > 25 && input.dayOfWeek <= 4) {
    const w = WORKOUT_LIBRARY.find((x) => x.id === 'intervals-5x400') ?? null;
    return {
      workoutType: 'interval',
      targetTss: Math.round(Math.max(60, avgPerRemainingDay * 1.2)),
      rationale: 'Очень свежая форма — отличный день для интервалов или соревнования.',
      suggestedWorkout: w,
    };
  }

  // Стандартный недельный паттерн (понедельник = 0):
  // 0 (Mon) — easy
  // 1 (Tue) — tempo
  // 2 (Wed) — easy / recovery
  // 3 (Thu) — interval
  // 4 (Fri) — rest
  // 5 (Sat) — long
  // 6 (Sun) — easy / rest
  const pattern: WorkoutType[] = ['easy', 'tempo', 'easy', 'interval', 'rest', 'long', 'easy'];
  let chosen: WorkoutType = pattern[input.dayOfWeek] ?? 'easy';

  // Корректировка по форме.
  if (zone.zone === 'fatigued' && (chosen === 'interval' || chosen === 'tempo')) {
    chosen = 'easy';
  }

  return buildRecommendation(chosen, avgPerRemainingDay, zone.zone);
}

/**
 * План на 7 дней.
 *
 * Вход:
 *   pmc — последние >=14 дней
 *   weekStart — Unix ms начала понедельника недели
 */
export function generateWeeklyPlan(input: {
  pmc: readonly PMCPoint[];
  weeklyDistanceKmGoal: number | null;
  weekStart: number;
}): WeeklyPlan {
  const last = input.pmc[input.pmc.length - 1];
  const ctl = last?.ctl ?? 0;
  const totalTargetTss = ctl > 0
    ? Math.round(ctl * 7 * 1.05)
    : Math.round((input.weeklyDistanceKmGoal ?? 0) * 6);

  const days: WeeklyPlanDay[] = [];
  // Стандартный паттерн.
  const pattern: WorkoutType[] = ['easy', 'tempo', 'easy', 'interval', 'rest', 'long', 'easy'];
  // Сколько TSS приходится на каждый тип в недельном бюджете.
  const weights: Record<WorkoutType, number> = {
    rest: 0,
    easy: 0.55,    // 5 easy дней (Mon, Wed, Sun) делят между собой ≈ 30% каждый, остальное — long/intensity
    long: 0.30,
    tempo: 0.15,
    interval: 0.20,
    race_pace: 0,
  };
  // Сначала посчитаем сумму weights использованных в pattern, нормализуем.
  const usedWeights = pattern.map((t) => weights[t]);
  const totalWeight = usedWeights.reduce((a, b) => a + b, 0) || 1;

  for (let d = 0; d < 7; d++) {
    const wType = pattern[d];
    const targetTss = wType === 'rest'
      ? 0
      : Math.round(totalTargetTss * (weights[wType] / totalWeight));
    const r = buildRecommendation(wType, targetTss, last ? tsbZone(last.tsb).zone : 'neutral');
    days.push({
      date: input.weekStart + d * 24 * 60 * 60 * 1000,
      dayOfWeek: d,
      recommendation: r,
    });
  }

  return {
    weekStart: input.weekStart,
    totalTargetTss,
    days,
  };
}

/**
 * Распределить TSS сессий по дням недели (0..6, Mon=0).
 * `weekStart` — начало понедельника локальной TZ.
 * Возвращает массив длиной 7.
 */
export function tssByDayOfWeek(
  sessions: readonly { startedAt: number; tss: number | null }[],
  weekStart: number,
): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
  for (const s of sessions) {
    if (s.startedAt < weekStart || s.startedAt >= weekEnd) continue;
    const dayIdx = Math.floor((s.startedAt - weekStart) / (24 * 60 * 60 * 1000));
    if (dayIdx < 0 || dayIdx > 6) continue;
    out[dayIdx] += s.tss ?? 0;
  }
  return out;
}

/**
 * Считается ли день выполненным: actual TSS ≥ 70% от target ИЛИ rest-день
 * без бега (actual < 30 TSS).
 */
export function isDayCompleted(targetTss: number, actualTss: number): boolean {
  if (targetTss === 0) return actualTss < 30; // rest-день: считается выполненным если не бегал
  return actualTss >= targetTss * 0.7;
}

/**
 * Найти ближайший понедельник 00:00 локально для заданной даты.
 */
export function startOfWeekLocal(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // JS: Sunday = 0, Monday = 1, ..., Saturday = 6.
  // Нам надо: понедельник = 0.
  const jsDay = d.getDay();
  const offsetDays = jsDay === 0 ? 6 : jsDay - 1;
  d.setDate(d.getDate() - offsetDays);
  return d.getTime();
}

function buildRecommendation(
  type: WorkoutType,
  targetTssRaw: number,
  zone: ReturnType<typeof tsbZone>['zone'],
): DailyRecommendation {
  const targetTss = Math.max(0, Math.round(targetTssRaw));
  switch (type) {
    case 'rest':
      return {
        workoutType: 'rest',
        targetTss: 0,
        rationale: 'День отдыха. Восстановление так же важно как тренировка.',
        suggestedWorkout: null,
      };
    case 'easy':
      return {
        workoutType: 'easy',
        targetTss,
        rationale: rationaleFor(zone, 'Лёгкий бег в Z2. Можно говорить полными предложениями.'),
        suggestedWorkout: WORKOUT_LIBRARY.find((w) => w.id === 'easy-30') ?? null,
      };
    case 'long':
      return {
        workoutType: 'long',
        targetTss,
        rationale: rationaleFor(zone, 'Длительный бег для аэробной базы. Z2.'),
        suggestedWorkout: WORKOUT_LIBRARY.find((w) => w.id === 'long-90') ?? null,
      };
    case 'tempo':
      return {
        workoutType: 'tempo',
        targetTss,
        rationale: rationaleFor(zone, 'Темповой — на пороге, говорить только короткими фразами.'),
        suggestedWorkout: WORKOUT_LIBRARY.find((w) => w.id === 'tempo-40') ?? null,
      };
    case 'interval':
      return {
        workoutType: 'interval',
        targetTss,
        rationale: rationaleFor(zone, 'Интервалы для развития VO2max. Высокая интенсивность.'),
        suggestedWorkout: WORKOUT_LIBRARY.find((w) => w.id === 'intervals-5x400') ?? null,
      };
    case 'race_pace':
      return {
        workoutType: 'race_pace',
        targetTss,
        rationale: 'Соревновательный темп — короткие интервалы на race pace.',
        suggestedWorkout: null,
      };
  }
}

function rationaleFor(zone: ReturnType<typeof tsbZone>['zone'], base: string): string {
  if (zone === 'fresh') return base + ' Форма свежая.';
  if (zone === 'fatigued') return base + ' Накопленная усталость — слушай тело.';
  if (zone === 'overreached') return base + ' Внимание: сильная усталость.';
  return base;
}
