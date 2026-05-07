// Workout session state machine.
// Phase 6 / P6-A-09.
//
// Чистая логика прогресса по структурированной тренировке. Отдельно от
// activity store — может тестироваться без зависимостей.
//
// Идея: на каждый tick (delta времени и дистанции с прошлого tick) обновляем
// состояние; если шаг завершён — переходим на следующий; если шаг повторяется
// (repeats: 5), увеличиваем repeatIdx и сбрасываем accumulator. Возвращаем
// event'ы (step-end, step-start, workout-complete), которые UI/voice может
// обыграть.

import type { Workout, WorkoutStep } from './workout';

export type WorkoutEvent =
  | { type: 'step-start'; stepIdx: number; repeatIdx: number; step: WorkoutStep }
  | { type: 'step-half'; stepIdx: number; repeatIdx: number; step: WorkoutStep }
  | { type: 'step-end'; stepIdx: number; repeatIdx: number; step: WorkoutStep }
  | { type: 'workout-complete' };

export type WorkoutSessionState = {
  /** Индекс текущего шага в Workout.steps. */
  currentStepIdx: number;
  /** Какое по счёту повторение (0-based) текущего шага. */
  repeatIdx: number;
  /** Сколько секунд провели на текущем шаге (текущем повторении). */
  elapsedInStepS: number;
  /** Сколько метров прошли на текущем шаге (текущем повторении). */
  distanceInStepM: number;
  /** Отметили ли уже event step-half для текущего шага+повтора. */
  halfEmitted: boolean;
  isComplete: boolean;
};

export function initWorkoutSession(): WorkoutSessionState {
  return {
    currentStepIdx: 0,
    repeatIdx: 0,
    elapsedInStepS: 0,
    distanceInStepM: 0,
    halfEmitted: false,
    isComplete: false,
  };
}

/**
 * Сколько секунд (или метров) длится текущий шаг до перехода.
 * Возвращает null если 'open' (без авто-перехода — надо нажать кнопку Skip).
 */
export function stepLimit(step: WorkoutStep): number | null {
  if (step.durationType === 'open' || step.durationValue === null) return null;
  return step.durationValue;
}

/**
 * Сколько повторений у шага (по умолчанию 1).
 */
export function stepRepeats(step: WorkoutStep): number {
  return step.repeats ?? 1;
}

/**
 * Прогресс шага в долях [0..1]. Для open-ended шага возвращает 0.
 */
export function stepProgress(state: WorkoutSessionState, step: WorkoutStep): number {
  const limit = stepLimit(step);
  if (limit === null || limit <= 0) return 0;
  const value = step.durationType === 'time' ? state.elapsedInStepS : state.distanceInStepM;
  return Math.min(1, Math.max(0, value / limit));
}

/**
 * Сделать tick — продвинуть состояние вперёд на deltaS секунд / deltaM метров.
 * Возвращает new state + список emitted events за этот tick.
 */
export function tickWorkout(
  state: WorkoutSessionState,
  workout: Workout,
  deltaS: number,
  deltaM: number,
): { next: WorkoutSessionState; events: WorkoutEvent[] } {
  if (state.isComplete) return { next: state, events: [] };
  if (workout.steps.length === 0) {
    return {
      next: { ...state, isComplete: true },
      events: [{ type: 'workout-complete' }],
    };
  }
  const events: WorkoutEvent[] = [];
  let cur = { ...state };
  cur.elapsedInStepS += Math.max(0, deltaS);
  cur.distanceInStepM += Math.max(0, deltaM);

  // Защита от бесконечного цикла на degenerate input.
  let safety = 1000;
  while (safety-- > 0) {
    const step = workout.steps[cur.currentStepIdx];
    if (!step) {
      cur.isComplete = true;
      events.push({ type: 'workout-complete' });
      break;
    }

    // Half-event: один раз в середине шага.
    const limit = stepLimit(step);
    if (limit !== null && !cur.halfEmitted) {
      const value = step.durationType === 'time' ? cur.elapsedInStepS : cur.distanceInStepM;
      if (value >= limit / 2) {
        events.push({
          type: 'step-half',
          stepIdx: cur.currentStepIdx,
          repeatIdx: cur.repeatIdx,
          step,
        });
        cur.halfEmitted = true;
      }
    }

    // Проверка: завершён ли текущий шаг?
    if (limit === null) {
      // Open-ended — не переходим автоматически, выходим.
      break;
    }
    const value = step.durationType === 'time' ? cur.elapsedInStepS : cur.distanceInStepM;
    if (value < limit) break;

    // Шаг завершён.
    events.push({
      type: 'step-end',
      stepIdx: cur.currentStepIdx,
      repeatIdx: cur.repeatIdx,
      step,
    });

    // Переход: следующий повтор или следующий шаг.
    const repeats = stepRepeats(step);
    const overshootValue = value - limit;

    if (cur.repeatIdx + 1 < repeats) {
      cur.repeatIdx += 1;
      cur.halfEmitted = false;
      // Перенести "перебор" в следующий повтор.
      if (step.durationType === 'time') {
        cur.elapsedInStepS = overshootValue;
        cur.distanceInStepM = 0;
      } else {
        cur.distanceInStepM = overshootValue;
        cur.elapsedInStepS = 0;
      }
      events.push({
        type: 'step-start',
        stepIdx: cur.currentStepIdx,
        repeatIdx: cur.repeatIdx,
        step,
      });
      continue;
    }

    // Все повторы шага сделаны → следующий шаг.
    cur.currentStepIdx += 1;
    cur.repeatIdx = 0;
    cur.halfEmitted = false;
    if (cur.currentStepIdx >= workout.steps.length) {
      cur.isComplete = true;
      events.push({ type: 'workout-complete' });
      break;
    }
    if (workout.steps[cur.currentStepIdx].durationType === 'time') {
      cur.elapsedInStepS = overshootValue;
      cur.distanceInStepM = 0;
    } else {
      cur.distanceInStepM = overshootValue;
      cur.elapsedInStepS = 0;
    }
    events.push({
      type: 'step-start',
      stepIdx: cur.currentStepIdx,
      repeatIdx: 0,
      step: workout.steps[cur.currentStepIdx],
    });
  }
  return { next: cur, events };
}

/**
 * Принудительный переход к следующему шагу (Skip button).
 * Не emit step-end для текущего, потому что пользователь его сам прервал.
 */
export function skipStep(
  state: WorkoutSessionState,
  workout: Workout,
): { next: WorkoutSessionState; events: WorkoutEvent[] } {
  if (state.isComplete) return { next: state, events: [] };
  const events: WorkoutEvent[] = [];
  const step = workout.steps[state.currentStepIdx];
  if (!step) {
    return {
      next: { ...state, isComplete: true },
      events: [{ type: 'workout-complete' }],
    };
  }
  const next = { ...state };
  const repeats = stepRepeats(step);
  if (next.repeatIdx + 1 < repeats) {
    next.repeatIdx += 1;
    next.elapsedInStepS = 0;
    next.distanceInStepM = 0;
    next.halfEmitted = false;
    events.push({
      type: 'step-start',
      stepIdx: next.currentStepIdx,
      repeatIdx: next.repeatIdx,
      step,
    });
  } else {
    next.currentStepIdx += 1;
    next.repeatIdx = 0;
    next.elapsedInStepS = 0;
    next.distanceInStepM = 0;
    next.halfEmitted = false;
    if (next.currentStepIdx >= workout.steps.length) {
      next.isComplete = true;
      events.push({ type: 'workout-complete' });
    } else {
      events.push({
        type: 'step-start',
        stepIdx: next.currentStepIdx,
        repeatIdx: 0,
        step: workout.steps[next.currentStepIdx],
      });
    }
  }
  return { next, events };
}

/**
 * Превратить event в человекочитаемую строку для voice/log.
 * Russian text-to-speech — короткие фразы, без сложных конструкций.
 */
export function eventToVoiceText(event: WorkoutEvent): string | null {
  if (event.type === 'workout-complete') return 'Тренировка завершена. Молодец!';
  if (event.type === 'step-start') {
    const what = stepTypeLabel(event.step.type);
    if ((event.step.repeats ?? 1) > 1) {
      return `${what}, повтор ${event.repeatIdx + 1}`;
    }
    return what;
  }
  if (event.type === 'step-half') {
    return 'Половина пройдена';
  }
  if (event.type === 'step-end') {
    const repeats = event.step.repeats ?? 1;
    if (repeats > 1 && event.repeatIdx + 1 < repeats) {
      return 'Повтор завершён';
    }
    return 'Шаг завершён';
  }
  return null;
}

function stepTypeLabel(t: WorkoutStep['type']): string {
  switch (t) {
    case 'warmup': return 'Разминка';
    case 'interval': return 'Интервал';
    case 'recovery': return 'Восстановление';
    case 'cooldown': return 'Заминка';
    case 'steady': return 'Ровный темп';
    case 'tempo': return 'Темповой';
    case 'race_pace': return 'Соревновательный темп';
  }
}
