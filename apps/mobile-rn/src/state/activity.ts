import { create } from 'zustand';

import type { ActivityState, Point } from '../domain/types';
import {
  createDefaultPipeline,
  PauseDetector,
  type PauseEvent,
} from '../pipeline';
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
  /** Принятые точки (после pipeline). */
  points: Point[];
  startedAt: number | null;
  endedAt: number | null;
  sessionId: number | null;
  /** Сколько ещё точек в буфере не сохранено в БД (для отладки). */
  bufferedCount: number;
  /** Сколько raw-точек прошло через pipeline и было отброшено фильтрами. */
  droppedCount: number;
  /** На паузе ли запись (auto-pause из PauseDetector). */
  isPaused: boolean;

  start: () => void;
  stop: () => void;
  /** Внутренний — вызывается из LocationAdapter после pipeline. */
  acceptPoint: (point: Point) => void;
  reset: () => void;
  recoverLast: () => void;
  /** Внутренние счётчики. */
  incrementDropped: () => void;
  setPaused: (paused: boolean) => void;
};

let buffer: Point[] = [];

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

// Pipeline и PauseDetector — singletons на module level.
// LocationAdapter callback вызывает их через exported helpers (см. ниже).
const pipeline = createDefaultPipeline({
  onDrop: (event) => {
    if (__DEV__) {
      console.log(`[pipeline] dropped by ${event.filterName}`);
    }
    useActivityStore.getState().incrementDropped();
  },
});

const pauseDetector = new PauseDetector((event: PauseEvent) => {
  useActivityStore.getState().setPaused(event.type === 'auto-paused');
  if (__DEV__) {
    console.log(`[pause] ${event.type}`);
  }
});

/**
 * Точка входа из LocationAdapter — вызывается на каждом raw-event.
 * Пропускает через pipeline, если принято — добавляет в state.
 */
export function ingestRawPoint(raw: {
  timestamp: number;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
}): void {
  const accepted = pipeline.process(raw);
  if (accepted === null) return;
  pauseDetector.observe(accepted);
  useActivityStore.getState().acceptPoint(accepted);
}

export const useActivityStore = create<ActivityStore>((set, get) => ({
  state: 'idle',
  points: [],
  startedAt: null,
  endedAt: null,
  sessionId: null,
  bufferedCount: 0,
  droppedCount: 0,
  isPaused: false,

  start: () => {
    const sessionId = Date.now();
    buffer = [];
    pipeline.reset();
    pauseDetector.reset();
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
      droppedCount: 0,
      isPaused: false,
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
    set({
      state: 'stopped',
      endedAt,
      bufferedCount: remainingBuffered,
      isPaused: false,
    });
  },

  acceptPoint: (point) => {
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
    pipeline.reset();
    pauseDetector.reset();
    set({
      state: 'idle',
      points: [],
      startedAt: null,
      endedAt: null,
      sessionId: null,
      bufferedCount: 0,
      droppedCount: 0,
      isPaused: false,
    });
  },

  recoverLast: () => {
    const { state } = get();
    if (state !== 'idle') return;
    let session = null;
    let pts: Point[] = [];
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
    pipeline.reset();
    pauseDetector.reset();
    set({
      state: 'stopped',
      points: pts,
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? pts[pts.length - 1]?.timestamp ?? null,
      sessionId: session.id,
      bufferedCount: 0,
      droppedCount: 0,
      isPaused: false,
    });
  },

  incrementDropped: () => set((s) => ({ droppedCount: s.droppedCount + 1 })),
  setPaused: (isPaused) => set({ isPaused }),
}));
