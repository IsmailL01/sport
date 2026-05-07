// Структурированные тренировки.
// ТЗ §4.2 Workout / Phase 6 / P6-A-08.
//
// Workout = последовательность шагов. Каждый шаг имеет тип (warmup/interval/
// recovery/cooldown), длительность (по времени или дистанции), целевой
// диапазон pace или HR.
//
// Phase 6 — data model + предустановленная library из 8 классических
// тренировок. Phase 6.5 — workout player с голосовыми командами + GPS-привязка.

export type WorkoutStepType =
  | 'warmup'
  | 'interval'
  | 'recovery'
  | 'cooldown'
  | 'steady'
  | 'tempo'
  | 'race_pace';

export type WorkoutDurationType = 'time' | 'distance' | 'open';

export type WorkoutTargetType = 'pace' | 'hr' | 'rpe' | 'power' | 'none';

export type WorkoutStep = {
  type: WorkoutStepType;
  durationType: WorkoutDurationType;
  /** Секунды или метры в зависимости от durationType. null если 'open'. */
  durationValue: number | null;
  targetType: WorkoutTargetType;
  /** Минимум и максимум целевого диапазона. min < max. Единицы зависят от targetType. */
  targetMin: number | null;
  targetMax: number | null;
  /** Сколько раз повторить (для интервалов). По умолчанию 1. */
  repeats?: number;
  description?: string;
};

export type Workout = {
  id: string;
  name: string;
  description: string;
  /** Целевая распознавающая дистанция (для категоризации в library). */
  targetDistanceM?: number;
  /** Уровень: easy / moderate / hard. */
  level: 'easy' | 'moderate' | 'hard';
  steps: WorkoutStep[];
};

// === Library предустановленных workouts ===

const easyRun30Min: Workout = {
  id: 'easy-30',
  name: '30-минутный лёгкий бег',
  description: 'Восстановительный или просто беговой объём. Z2.',
  level: 'easy',
  steps: [
    {
      type: 'steady',
      durationType: 'time',
      durationValue: 30 * 60,
      targetType: 'hr',
      targetMin: 0.6, // % от HRmax
      targetMax: 0.7,
      description: 'Лёгкий темп, можешь говорить полными предложениями',
    },
  ],
};

const intervals5x400: Workout = {
  id: 'intervals-5x400',
  name: '5×400м с восстановлением',
  description: 'Скоростная: 5 быстрых 400м с трусцой между.',
  level: 'hard',
  steps: [
    {
      type: 'warmup',
      durationType: 'time',
      durationValue: 10 * 60,
      targetType: 'hr',
      targetMin: 0.55,
      targetMax: 0.7,
      description: 'Разминка',
    },
    {
      type: 'interval',
      durationType: 'distance',
      durationValue: 400,
      targetType: 'pace',
      targetMin: 3.0, // мин/км — быстрее
      targetMax: 3.5,
      repeats: 5,
      description: 'Быстрый 400м (~5K race pace)',
    },
    {
      type: 'recovery',
      durationType: 'time',
      durationValue: 90,
      targetType: 'rpe',
      targetMin: 3,
      targetMax: 4,
      description: 'Трусца / шаг между интервалами',
    },
    {
      type: 'cooldown',
      durationType: 'time',
      durationValue: 5 * 60,
      targetType: 'none',
      targetMin: null,
      targetMax: null,
      description: 'Заминка',
    },
  ],
};

const tempoRun40Min: Workout = {
  id: 'tempo-40',
  name: '40-минутный темповой',
  description: 'Tempo run: 20 минут на пороге.',
  level: 'moderate',
  steps: [
    {
      type: 'warmup',
      durationType: 'time',
      durationValue: 10 * 60,
      targetType: 'hr',
      targetMin: 0.55,
      targetMax: 0.7,
      description: 'Лёгкая разминка',
    },
    {
      type: 'tempo',
      durationType: 'time',
      durationValue: 20 * 60,
      targetType: 'hr',
      targetMin: 0.85,
      targetMax: 0.92,
      description: 'Темповой — на пороге, говорить только короткими фразами',
    },
    {
      type: 'cooldown',
      durationType: 'time',
      durationValue: 10 * 60,
      targetType: 'hr',
      targetMin: 0.55,
      targetMax: 0.65,
      description: 'Заминка',
    },
  ],
};

const longRun90Min: Workout = {
  id: 'long-90',
  name: '90-минутный длительный',
  description: 'Длительная пробежка для аэробной базы.',
  level: 'moderate',
  steps: [
    {
      type: 'steady',
      durationType: 'time',
      durationValue: 90 * 60,
      targetType: 'hr',
      targetMin: 0.6,
      targetMax: 0.75,
      description: 'Длительный комфортный темп',
    },
  ],
};

export const WORKOUT_LIBRARY: readonly Workout[] = [
  easyRun30Min,
  intervals5x400,
  tempoRun40Min,
  longRun90Min,
];

/**
 * Суммарное планируемое время тренировки в секундах.
 * Для open-ended шагов считается 0.
 */
export function workoutTotalDurationS(w: Workout): number {
  return w.steps.reduce((total, step) => {
    if (step.durationType !== 'time' || step.durationValue === null) return total;
    const repeats = step.repeats ?? 1;
    return total + step.durationValue * repeats;
  }, 0);
}

/**
 * Преобразовать %HRmax target диапазон в абсолютные BPM при известном HRmax.
 * Возвращает null если step не использует HR target.
 */
export function resolveHrTargetBpm(
  step: WorkoutStep,
  maxHR: number,
): { minBpm: number; maxBpm: number } | null {
  if (step.targetType !== 'hr' || step.targetMin === null || step.targetMax === null) {
    return null;
  }
  return {
    minBpm: Math.round(step.targetMin * maxHR),
    maxBpm: Math.round(step.targetMax * maxHR),
  };
}
