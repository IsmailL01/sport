// Workout Player state — связывает Workout с активной сессией пробежки.
// Phase 6 / P6-A-09.
//
// Идея: пользователь выбирает Workout из библиотеки → эта store мониторит
// activity (points, elapsed) → делает tickWorkout на каждом изменении →
// транслирует events в voice/UI.

import { create } from 'zustand';

import {
  initWorkoutSession,
  skipStep,
  tickWorkout,
  eventToVoiceText,
  type WorkoutEvent,
  type WorkoutSessionState,
} from '../domain/training/workoutSession';
import type { Workout } from '../domain/training/workout';
import { speak } from '../util/speech';
import { useActivityStore } from './activity';
import { totalDistance } from '../util/geo';

type WorkoutPlayerStore = {
  workout: Workout | null;
  session: WorkoutSessionState;
  /** Время последнего tick (ms) — для вычисления delta. */
  lastTickAt: number | null;
  /** Дистанция на последнем tick (m) — для вычисления delta. */
  lastTickDistanceM: number;
  /** История всех событий за тренировку (для последующего анализа). */
  eventLog: { at: number; event: WorkoutEvent }[];

  /** Стартовать тренировку: сохранить workout, инициализировать session. */
  start: (workout: Workout) => void;

  /** Применить tick от внешнего наблюдателя (activity store). */
  applyTick: (nowMs: number, totalDistanceM: number) => void;

  /** Принудительно перейти к следующему шагу. */
  skip: () => void;

  /** Завершить тренировку (успешно или досрочно). */
  finish: () => void;
};

export const useWorkoutPlayerStore = create<WorkoutPlayerStore>((set, get) => ({
  workout: null,
  session: initWorkoutSession(),
  lastTickAt: null,
  lastTickDistanceM: 0,
  eventLog: [],

  start: (workout) => {
    set({
      workout,
      session: initWorkoutSession(),
      lastTickAt: null,
      lastTickDistanceM: 0,
      eventLog: [],
    });
    // Голосовая подсказка о начале + первом шаге.
    if (workout.steps.length > 0) {
      const first = workout.steps[0];
      const startEvent: WorkoutEvent = {
        type: 'step-start',
        stepIdx: 0,
        repeatIdx: 0,
        step: first,
      };
      const text = eventToVoiceText(startEvent);
      if (text) speak(text);
      set((s) => ({
        eventLog: [...s.eventLog, { at: Date.now(), event: startEvent }],
      }));
    }
  },

  applyTick: (nowMs, totalDistanceMNow) => {
    const { workout, session, lastTickAt, lastTickDistanceM } = get();
    if (!workout || session.isComplete) return;
    if (lastTickAt === null) {
      set({ lastTickAt: nowMs, lastTickDistanceM: totalDistanceMNow });
      return;
    }
    const deltaS = Math.max(0, (nowMs - lastTickAt) / 1000);
    const deltaM = Math.max(0, totalDistanceMNow - lastTickDistanceM);
    if (deltaS === 0 && deltaM === 0) return;
    const { next, events } = tickWorkout(session, workout, deltaS, deltaM);
    // Озвучить (если voice doable).
    for (const e of events) {
      const text = eventToVoiceText(e);
      if (text) speak(text);
    }
    set((s) => ({
      session: next,
      lastTickAt: nowMs,
      lastTickDistanceM: totalDistanceMNow,
      eventLog: events.length > 0
        ? [...s.eventLog, ...events.map((event) => ({ at: nowMs, event }))]
        : s.eventLog,
    }));
  },

  skip: () => {
    const { workout, session } = get();
    if (!workout || session.isComplete) return;
    const { next, events } = skipStep(session, workout);
    for (const e of events) {
      const text = eventToVoiceText(e);
      if (text) speak(text);
    }
    set((s) => ({
      session: next,
      lastTickAt: Date.now(),
      eventLog: events.length > 0
        ? [...s.eventLog, ...events.map((event) => ({ at: Date.now(), event }))]
        : s.eventLog,
    }));
  },

  finish: () => {
    set({
      workout: null,
      session: initWorkoutSession(),
      lastTickAt: null,
      lastTickDistanceM: 0,
    });
  },
}));

/**
 * Подключить workout player к activity store: на каждое изменение points
 * вычислять delta и применять к workout session. Возвращает unsubscribe.
 *
 * Вызывается один раз из App.tsx после начала тренировки и активной сессии.
 */
export function attachWorkoutPlayerToActivity(): () => void {
  const unsub = useActivityStore.subscribe((state) => {
    const { workout, session, applyTick } = useWorkoutPlayerStore.getState();
    if (!workout || session.isComplete) return;
    if (state.state !== 'recording' || state.isPaused) return;
    const now = Date.now();
    const distM = totalDistance(state.points);
    applyTick(now, distM);
  });
  return unsub;
}
