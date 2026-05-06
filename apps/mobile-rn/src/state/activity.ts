import { create } from 'zustand';

import type { ActivityState, RawPoint } from '../domain/types';
import {
  appendPoints,
  loadPointsForSession,
} from '../storage/pointRepository';
import {
  createSession,
  deleteSession,
  finalizeSession,
  findActiveSession,
} from '../storage/sessionRepository';
import { computeArea, isClosed, totalDistance } from '../util/geo';

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

let buffer: RawPoint[] = [];

function flushBuffer(sessionId: number | null, force: boolean): number {
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
    try {
      createSession({ id: sessionId, startedAt: sessionId });
    } catch (e) {
      console.error('[activity] createSession failed', e);
    }
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
    const { sessionId, state, points } = get();
    if (state !== 'recording') return;
    const remainingBuffered = flushBuffer(sessionId, true);
    const endedAt = Date.now();
    if (sessionId !== null) {
      const distance = totalDistance(points);
      const closed = isClosed(points, distance);
      const area = closed ? computeArea(points) : null;
      try {
        finalizeSession(sessionId, {
          endedAt,
          isClosed: closed,
          distanceM: distance,
          areaM2: area,
          calcMethod: closed ? 'shoelace_simple' : null,
        });
      } catch (e) {
        console.error('[activity] finalizeSession failed', e);
      }
    }
    set({ state: 'stopped', endedAt, bufferedCount: remainingBuffered });
  },

  addPoint: (point) => {
    const { state, sessionId } = get();
    if (state !== 'recording') return;
    buffer.push(point);
    set((s) => ({
      points: [...s.points, point],
      bufferedCount: buffer.length,
    }));
    const after = flushBuffer(sessionId, false);
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
    if (state !== 'idle') return;
    let session = null;
    let pts: RawPoint[] = [];
    try {
      session = findActiveSession();
      if (session !== null) {
        pts = loadPointsForSession(session.id);
      }
    } catch (e) {
      console.error('[activity] recover failed', e);
      return;
    }
    if (session === null || pts.length === 0) return;
    buffer = [];
    set({
      state: 'stopped',
      points: pts,
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? pts[pts.length - 1]?.timestamp ?? null,
      sessionId: session.id,
      bufferedCount: 0,
    });
  },
}));
