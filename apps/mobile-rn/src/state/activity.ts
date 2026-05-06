import { create } from 'zustand';
import type { ActivityState, RawPoint } from '../domain/types';
import {
  appendPoints,
  deleteSession,
  getLastSessionId,
  loadPointsForSession,
} from '../storage/pointRepository';

const FLUSH_THRESHOLD = 10;

type ActivityStore = {
  state: ActivityState;
  points: RawPoint[];
  startedAt: number | null;
  endedAt: number | null;
  sessionId: number | null;
  /** Сколько ещё точек в буфере не сохранено в БД (для отладки). */
  bufferedCount: number;

  start: () => void;
  stop: () => void;
  addPoint: (point: RawPoint) => void;
  reset: () => void;
  /** Восстановить последнюю незавершённую сессию из БД. */
  recoverLast: () => void;
};

// Buffer вне store — не нужен в UI, но удобно держать живой.
let buffer: RawPoint[] = [];

function flushBufferIfReady(sessionId: number | null, force: boolean): number {
  if (sessionId === null) return 0;
  if (!force && buffer.length < FLUSH_THRESHOLD) return buffer.length;
  if (buffer.length === 0) return 0;
  try {
    appendPoints(sessionId, buffer);
    buffer = [];
  } catch (e) {
    console.error('[activity] flush failed', e);
  }
  return 0;
}

export const useActivityStore = create<ActivityStore>((set, get) => ({
  state: 'idle',
  points: [],
  startedAt: null,
  endedAt: null,
  sessionId: null,
  bufferedCount: 0,

  start: () => {
    const sessionId = Date.now();
    buffer = [];
    set({
      state: 'recording',
      points: [],
      startedAt: sessionId,
      endedAt: null,
      sessionId,
      bufferedCount: 0,
    });
  },

  stop: () => {
    const { sessionId, state } = get();
    if (state !== 'recording') return;
    const remaining = flushBufferIfReady(sessionId, true);
    set({ state: 'stopped', endedAt: Date.now(), bufferedCount: remaining });
  },

  addPoint: (point) => {
    const { state, sessionId } = get();
    if (state !== 'recording') return;
    buffer.push(point);
    set((s) => ({
      points: [...s.points, point],
      bufferedCount: buffer.length,
    }));
    const after = flushBufferIfReady(sessionId, false);
    if (after !== buffer.length || buffer.length === 0) {
      set({ bufferedCount: after });
    }
  },

  reset: () => {
    const { sessionId } = get();
    if (sessionId !== null) {
      try {
        deleteSession(sessionId);
      } catch (e) {
        console.error('[activity] deleteSession failed', e);
      }
    }
    buffer = [];
    set({
      state: 'idle',
      points: [],
      startedAt: null,
      endedAt: null,
      sessionId: null,
      bufferedCount: 0,
    });
  },

  recoverLast: () => {
    const { state } = get();
    if (state !== 'idle') return; // не перезаписываем активную запись
    let sid: number | null = null;
    let pts: RawPoint[] = [];
    try {
      sid = getLastSessionId();
      if (sid !== null) {
        pts = loadPointsForSession(sid);
      }
    } catch (e) {
      console.error('[activity] recover failed', e);
      return;
    }
    if (sid === null || pts.length === 0) return;
    buffer = [];
    set({
      state: 'stopped',
      points: pts,
      startedAt: pts[0]?.timestamp ?? null,
      endedAt: pts[pts.length - 1]?.timestamp ?? null,
      sessionId: sid,
      bufferedCount: 0,
    });
  },
}));
