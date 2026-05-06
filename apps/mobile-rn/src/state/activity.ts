import { create } from 'zustand';
import type { ActivityState, RawPoint } from '../domain/types';

type ActivityStore = {
  state: ActivityState;
  points: RawPoint[];
  startedAt: number | null;
  endedAt: number | null;

  start: () => void;
  stop: () => void;
  addPoint: (point: RawPoint) => void;
  reset: () => void;
};

export const useActivityStore = create<ActivityStore>((set) => ({
  state: 'idle',
  points: [],
  startedAt: null,
  endedAt: null,

  start: () =>
    set({
      state: 'recording',
      points: [],
      startedAt: Date.now(),
      endedAt: null,
    }),

  stop: () =>
    set((s) =>
      s.state === 'recording'
        ? { state: 'stopped', endedAt: Date.now() }
        : s,
    ),

  addPoint: (point) =>
    set((s) =>
      s.state === 'recording'
        ? { points: [...s.points, point] }
        : s,
    ),

  reset: () =>
    set({ state: 'idle', points: [], startedAt: null, endedAt: null }),
}));
