import {
  eventToVoiceText,
  initWorkoutSession,
  skipStep,
  stepProgress,
  tickWorkout,
} from '../domain/training/workoutSession';
import type { Workout } from '../domain/training/workout';

const simpleTimeWorkout: Workout = {
  id: 'test-time',
  name: 'Test',
  description: '',
  level: 'easy',
  steps: [
    {
      type: 'warmup',
      durationType: 'time',
      durationValue: 60, // 1 минута
      targetType: 'none',
      targetMin: null,
      targetMax: null,
    },
    {
      type: 'steady',
      durationType: 'time',
      durationValue: 120, // 2 минуты
      targetType: 'none',
      targetMin: null,
      targetMax: null,
    },
  ],
};

const intervalsWorkout: Workout = {
  id: 'test-int',
  name: 'Intervals',
  description: '',
  level: 'hard',
  steps: [
    {
      type: 'interval',
      durationType: 'distance',
      durationValue: 400,
      targetType: 'none',
      targetMin: null,
      targetMax: null,
      repeats: 3,
    },
  ],
};

const openWorkout: Workout = {
  id: 'test-open',
  name: 'Open',
  description: '',
  level: 'easy',
  steps: [
    {
      type: 'steady',
      durationType: 'open',
      durationValue: null,
      targetType: 'none',
      targetMin: null,
      targetMax: null,
    },
  ],
};

describe('initWorkoutSession', () => {
  it('начальное состояние корректное', () => {
    const s = initWorkoutSession();
    expect(s.currentStepIdx).toBe(0);
    expect(s.repeatIdx).toBe(0);
    expect(s.elapsedInStepS).toBe(0);
    expect(s.distanceInStepM).toBe(0);
    expect(s.isComplete).toBe(false);
  });
});

describe('tickWorkout — time-based progression', () => {
  it('накапливает elapsed без событий пока шаг не завершён', () => {
    let s = initWorkoutSession();
    const r1 = tickWorkout(s, simpleTimeWorkout, 10, 50);
    expect(r1.next.elapsedInStepS).toBe(10);
    expect(r1.next.distanceInStepM).toBe(50);
    expect(r1.events).toEqual([]);
    expect(r1.next.currentStepIdx).toBe(0);
  });

  it('emit step-half в середине шага', () => {
    const s = initWorkoutSession();
    const r = tickWorkout(s, simpleTimeWorkout, 30, 0);
    // 30s of 60s warmup → halfway exactly.
    expect(r.events.some((e) => e.type === 'step-half')).toBe(true);
    expect(r.next.halfEmitted).toBe(true);
  });

  it('переход на следующий шаг при достижении лимита', () => {
    const s = initWorkoutSession();
    const r = tickWorkout(s, simpleTimeWorkout, 60, 0);
    expect(r.events.some((e) => e.type === 'step-end' && e.stepIdx === 0)).toBe(true);
    expect(r.events.some((e) => e.type === 'step-start' && e.stepIdx === 1)).toBe(true);
    expect(r.next.currentStepIdx).toBe(1);
    expect(r.next.elapsedInStepS).toBe(0);
  });

  it('перенос overshoot во второй шаг', () => {
    const s = initWorkoutSession();
    const r = tickWorkout(s, simpleTimeWorkout, 70, 0);
    // 60s warmup done, 10s overshoot переносится в steady.
    expect(r.next.currentStepIdx).toBe(1);
    expect(r.next.elapsedInStepS).toBe(10);
  });

  it('завершение workout после всех шагов', () => {
    const s = initWorkoutSession();
    const r = tickWorkout(s, simpleTimeWorkout, 200, 0);
    // 60s + 120s = 180s, плюс 20s overshoot.
    expect(r.next.isComplete).toBe(true);
    expect(r.events.some((e) => e.type === 'workout-complete')).toBe(true);
  });
});

describe('tickWorkout — distance-based with repeats', () => {
  it('повтор интервала по достижении дистанции', () => {
    let s = initWorkoutSession();
    const r1 = tickWorkout(s, intervalsWorkout, 60, 400);
    // Первый 400м завершён, начался второй повтор.
    expect(r1.events.some((e) => e.type === 'step-end' && e.repeatIdx === 0)).toBe(true);
    expect(r1.events.some((e) => e.type === 'step-start' && e.repeatIdx === 1)).toBe(true);
    expect(r1.next.repeatIdx).toBe(1);
    expect(r1.next.distanceInStepM).toBe(0);
  });

  it('после всех repeats — workout-complete', () => {
    const s = initWorkoutSession();
    // 1200м = 3 × 400.
    const r = tickWorkout(s, intervalsWorkout, 200, 1200);
    expect(r.next.isComplete).toBe(true);
    expect(r.events.filter((e) => e.type === 'step-end').length).toBe(3);
    expect(r.events.some((e) => e.type === 'workout-complete')).toBe(true);
  });
});

describe('tickWorkout — open-ended step', () => {
  it('не завершается автоматически', () => {
    const s = initWorkoutSession();
    const r = tickWorkout(s, openWorkout, 10000, 5000);
    expect(r.next.isComplete).toBe(false);
    expect(r.next.currentStepIdx).toBe(0);
    expect(r.next.elapsedInStepS).toBe(10000);
  });
});

describe('skipStep', () => {
  it('переходит на следующий шаг', () => {
    const s = initWorkoutSession();
    const r = skipStep({ ...s, elapsedInStepS: 5 }, simpleTimeWorkout);
    expect(r.next.currentStepIdx).toBe(1);
    expect(r.next.elapsedInStepS).toBe(0);
    expect(r.events.some((e) => e.type === 'step-start' && e.stepIdx === 1)).toBe(true);
  });

  it('skip последнего шага → workout-complete', () => {
    const s = { ...initWorkoutSession(), currentStepIdx: 1, elapsedInStepS: 30 };
    const r = skipStep(s, simpleTimeWorkout);
    expect(r.next.isComplete).toBe(true);
    expect(r.events.some((e) => e.type === 'workout-complete')).toBe(true);
  });

  it('skip между repeats увеличивает repeatIdx', () => {
    const s = { ...initWorkoutSession(), distanceInStepM: 100 };
    const r = skipStep(s, intervalsWorkout);
    expect(r.next.repeatIdx).toBe(1);
    expect(r.next.distanceInStepM).toBe(0);
    expect(r.next.currentStepIdx).toBe(0);
  });
});

describe('stepProgress', () => {
  it('0 в начале, 1 в конце', () => {
    const step = simpleTimeWorkout.steps[0];
    expect(stepProgress({ ...initWorkoutSession() }, step)).toBe(0);
    expect(
      stepProgress({ ...initWorkoutSession(), elapsedInStepS: 30 }, step),
    ).toBeCloseTo(0.5);
    expect(
      stepProgress({ ...initWorkoutSession(), elapsedInStepS: 60 }, step),
    ).toBe(1);
    // Overshoot clamped to 1.
    expect(
      stepProgress({ ...initWorkoutSession(), elapsedInStepS: 99 }, step),
    ).toBe(1);
  });

  it('0 для open-ended', () => {
    expect(stepProgress(initWorkoutSession(), openWorkout.steps[0])).toBe(0);
  });
});

describe('eventToVoiceText', () => {
  it('создаёт строку для каждого типа event', () => {
    const step = simpleTimeWorkout.steps[0];
    expect(eventToVoiceText({
      type: 'step-start', stepIdx: 0, repeatIdx: 0, step,
    })).toMatch(/Разминка/);
    expect(eventToVoiceText({
      type: 'step-half', stepIdx: 0, repeatIdx: 0, step,
    })).toMatch(/Половина/);
    expect(eventToVoiceText({
      type: 'step-end', stepIdx: 0, repeatIdx: 0, step,
    })).toBeTruthy();
    expect(eventToVoiceText({ type: 'workout-complete' })).toMatch(/завершена/);
  });

  it('для интервалов с repeats показывает номер', () => {
    const step = intervalsWorkout.steps[0];
    const text = eventToVoiceText({
      type: 'step-start', stepIdx: 0, repeatIdx: 2, step,
    });
    expect(text).toMatch(/3/); // repeatIdx 2 → "повтор 3" 1-based
  });
});
