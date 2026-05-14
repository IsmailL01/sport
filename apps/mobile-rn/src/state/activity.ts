import { create } from 'zustand';

import { calculateArea, type AreaWarning } from '../domain/AreaCalculator';
import { ClosureDetector } from '../domain/ClosureDetector';
import type { ActivityState, ActivityType, Point } from '../domain/types';
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
import { aggregateHrForSession } from '../storage/sensorRepository';
import { appendLapsForSession } from '../storage/lapRepository';
import { isClosed, totalDistance } from '../util/geo';
import { estimateCaloriesBest } from '../domain/calories';
import { lapFromRange, type Lap } from '../domain/lap';
import { detectNewRecords, type PersonalRecord } from '../domain/records';
import { getCurrentValuesByKind, upsertRecord } from '../storage/recordsRepository';
import { useSettingsStore } from './settings';
import { useAuthStore } from './auth';
import { useWalletStore } from './wallet';

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
  /** Всего raw-точек получено от LocationAdapter (до pipeline). */
  rawCount: number;
  /** Сколько raw-точек прошло через pipeline и было отброшено фильтрами. */
  droppedCount: number;
  /** Имя последнего фильтра, который отбросил точку (для диагностики). */
  lastDropFilter: string | null;
  /** Accuracy последнего raw-измерения (даже если точка отброшена). */
  lastRawAccuracy: number | null;
  /** На паузе ли запись (auto-pause из PauseDetector). */
  isPaused: boolean;
  /** true когда трек впервые замкнулся (см. ClosureDetector). Сбрасывается при reset. */
  closureFired: boolean;
  /** Площадь и предупреждения от AreaCalculator (актуальны если isClosedNow). */
  areaM2: number | null;
  areaWarnings: AreaWarning[];
  /** M10.1: новые личные рекорды, выставленные последней finalize-сессией.
   *  RunDetailsScreen считывает + сразу очищает (acknowledgement). */
  lastNewRecords: PersonalRecord[];
  /** Тип активности текущей сессии (выбирается на TrackerStart). */
  activityType: ActivityType;
  /** Manual lap-marks за сессию (см. domain/lap.ts). */
  laps: Lap[];
  /** Индекс точки в `points`, с которой начинается текущий lap. */
  lapStartIdx: number;

  start: (activityType?: ActivityType) => void;
  stop: () => void;
  /** Зафиксировать текущий lap и начать новый. */
  markLap: () => void;
  /** Внутренний — вызывается из LocationAdapter после pipeline. */
  acceptPoint: (point: Point) => void;
  reset: () => void;
  recoverLast: () => void;
  /** Внутренние счётчики. */
  incrementDropped: (filterName: string) => void;
  setPaused: (paused: boolean) => void;
  setClosureFired: () => void;
  setArea: (areaM2: number | null, warnings: AreaWarning[]) => void;
  noteRaw: (accuracy: number | null) => void;
  /** RunDetailsScreen вызывает после показа prompt'а. */
  acknowledgeNewRecords: () => void;
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
    useActivityStore.getState().incrementDropped(event.filterName);
  },
});

const pauseDetector = new PauseDetector((event: PauseEvent) => {
  useActivityStore.getState().setPaused(event.type === 'auto-paused');
  if (__DEV__) {
    console.log(`[pause] ${event.type}`);
  }
});

const closureDetector = new ClosureDetector((event) => {
  useActivityStore.getState().setClosureFired();
  // Сразу пересчитываем площадь по AreaCalculator (с warnings).
  const points = useActivityStore.getState().points;
  const result = calculateArea(points);
  useActivityStore.getState().setArea(result.areaM2, result.warnings);
  if (__DEV__) {
    console.log(
      `[closure] fired (dist=${event.totalDistanceM.toFixed(0)}m, gap=${event.closeGapM.toFixed(0)}m, area=${result.areaM2?.toFixed(0)}m²)`,
    );
  }
});

// Throttle для recompute area (не каждые 1 точку — каждые 30с).
let lastAreaRecompute = 0;
const AREA_RECOMPUTE_INTERVAL_MS = 30_000;

function maybeRecomputeArea(): void {
  if (!useActivityStore.getState().closureFired) return;
  const now = Date.now();
  if (now - lastAreaRecompute < AREA_RECOMPUTE_INTERVAL_MS) return;
  lastAreaRecompute = now;
  const points = useActivityStore.getState().points;
  const result = calculateArea(points);
  useActivityStore.getState().setArea(result.areaM2, result.warnings);
}

/**
 * Точка входа из LocationAdapter — вызывается на каждом raw-event.
 * Пропускает через pipeline, если принято — добавляет в state.
 * Раw-метаданные (accuracy, raw count) сохраняем всегда — для UI-диагностики.
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
  useActivityStore.getState().noteRaw(raw.accuracy);
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
  rawCount: 0,
  droppedCount: 0,
  lastDropFilter: null,
  lastRawAccuracy: null,
  isPaused: false,
  closureFired: false,
  areaM2: null,
  areaWarnings: [],
  lastNewRecords: [],
  activityType: 'run',
  laps: [],
  lapStartIdx: 0,

  start: (activityType = 'run') => {
    const sessionId = Date.now();
    buffer = [];
    pipeline.reset();
    pauseDetector.reset();
    closureDetector.reset();
    lastAreaRecompute = 0;
    try {
      createSession({ id: sessionId, startedAt: sessionId, activityType });
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
      rawCount: 0,
      droppedCount: 0,
      lastDropFilter: null,
      lastRawAccuracy: null,
      isPaused: false,
      closureFired: false,
      areaM2: null,
      areaWarnings: [],
      activityType,
      laps: [],
      lapStartIdx: 0,
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
      // Финальный пересчёт через AreaCalculator (с упрощением + детектом самопересечения).
      const areaResult = closed
        ? calculateArea(points)
        : { areaM2: null, method: null, warnings: [] as AreaWarning[] };
      // Аггрегируем HR-данные сессии (если sensor был подключён в Phase 5+).
      let avgHrBpm: number | null = null;
      let maxHrBpm: number | null = null;
      try {
        const hr = aggregateHrForSession(sessionId);
        avgHrBpm = hr.avgHrBpm;
        maxHrBpm = hr.maxHrBpm;
      } catch (e) {
        console.warn('[activity] aggregateHrForSession failed', e);
      }
      // Оценка калорий: HR-based если есть полная биометрия и HR, иначе MET.
      const startedAt = get().startedAt;
      const durationS = startedAt !== null ? (endedAt - startedAt) / 1000 : 0;
      const athlete = useSettingsStore.getState().athlete;
      const activityType = get().activityType;
      const caloriesKcal = estimateCaloriesBest(
        activityType,
        athlete,
        avgHrBpm,
        durationS,
        distance,
      );
      try {
        finalizeSession(sessionId, {
          endedAt,
          isClosed: closed,
          distanceM: distance,
          areaM2: areaResult.areaM2,
          calcMethod: areaResult.method,
          avgHrBpm,
          maxHrBpm,
          caloriesKcal,
        });
      } catch (e) {
        console.error('[activity] finalizeSession failed', e);
      }

      // Currency: начислить монеты за сессию (если есть user + kcal). См. domain/currency.ts.
      try {
        const userId = useAuthStore.getState().user?.id ?? null;
        if (userId !== null && caloriesKcal !== null && durationS > 0) {
          useWalletStore.getState().awardForSession({
            userId,
            sessionId,
            activity: activityType,
            kcal: caloriesKcal,
            durationS,
            distanceM: distance,
            avgHrBpm,
          });
        }
      } catch (e) {
        console.warn('[activity] awardForSession failed', e);
      }

      // Финализируем последний lap (между последним lap-mark и финишем).
      try {
        const lapStart = get().lapStartIdx;
        const existingLaps = get().laps;
        const allLaps = [...existingLaps];
        if (points.length - lapStart >= 2) {
          const tail = lapFromRange(points, lapStart, existingLaps.length + 1);
          if (tail !== null) allLaps.push(tail);
        }
        if (allLaps.length > 0) {
          appendLapsForSession(sessionId, allLaps);
          set({ laps: allLaps });
        }
      } catch (e) {
        console.warn('[activity] persist laps failed', e);
      }

      // M10.1: detect и persist новые личные рекорды.
      let newRecords: PersonalRecord[] = [];
      try {
        if (startedAt !== null && distance > 0 && durationS > 0) {
          const current = getCurrentValuesByKind();
          const detected = detectNewRecords(
            {
              sessionId, startedAt, endedAt,
              distanceM: distance, durationS, caloriesKcal,
            },
            points,
            current,
          );
          newRecords = detected.map((d) => ({
            kind: d.kind,
            value: d.value,
            sessionId,
            achievedAt: endedAt,
            prevValue: d.prevValue,
          }));
          for (const rec of newRecords) {
            upsertRecord(rec);
          }
        }
      } catch (e) {
        console.warn('[activity] detectNewRecords failed', e);
      }

      set({
        state: 'stopped',
        endedAt,
        bufferedCount: remainingBuffered,
        isPaused: false,
        areaM2: areaResult.areaM2,
        areaWarnings: areaResult.warnings,
        lastNewRecords: newRecords,
      });
    } else {
      set({
        state: 'stopped',
        endedAt,
        bufferedCount: remainingBuffered,
        isPaused: false,
      });
    }
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
    // Пробуем детект замыкания и пересчёт площади.
    const fresh = useActivityStore.getState().points;
    closureDetector.check(fresh);
    maybeRecomputeArea();
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
    closureDetector.reset();
    lastAreaRecompute = 0;
    set({
      state: 'idle',
      points: [],
      startedAt: null,
      endedAt: null,
      sessionId: null,
      bufferedCount: 0,
      rawCount: 0,
      droppedCount: 0,
      lastDropFilter: null,
      lastRawAccuracy: null,
      isPaused: false,
      closureFired: false,
      areaM2: null,
      areaWarnings: [],
      lastNewRecords: [],
      activityType: 'run',
      laps: [],
      lapStartIdx: 0,
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
    closureDetector.reset();
    lastAreaRecompute = 0;
    // Если у session уже есть закрытие (recovered after stop) — переопределим area.
    const recoveredArea = session.areaM2;
    set({
      state: 'stopped',
      points: pts,
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? pts[pts.length - 1]?.timestamp ?? null,
      sessionId: session.id,
      bufferedCount: 0,
      droppedCount: 0,
      isPaused: false,
      closureFired: session.isClosed === true,
      areaM2: recoveredArea,
      areaWarnings:
        session.calcMethod === 'shoelace_with_warning' ? ['self-intersection'] : [],
    });
  },

  markLap: () => {
    // Functional set: гарантирует, что мы читаем актуальный points даже если
    // между вычислением и записью пришла новая точка через acceptPoint.
    set((s) => {
      if (s.state !== 'recording') return s;
      if (s.points.length - s.lapStartIdx < 2) return s; // нужны ≥2 точки
      const lap = lapFromRange(s.points, s.lapStartIdx, s.laps.length + 1);
      if (lap === null) return s;
      return {
        laps: [...s.laps, lap],
        lapStartIdx: s.points.length - 1,
      };
    });
  },

  incrementDropped: (filterName) =>
    set((s) => ({ droppedCount: s.droppedCount + 1, lastDropFilter: filterName })),
  setPaused: (isPaused) => set({ isPaused }),
  setClosureFired: () => set({ closureFired: true }),
  setArea: (areaM2, areaWarnings) => set({ areaM2, areaWarnings }),
  noteRaw: (accuracy) =>
    set((s) => ({ rawCount: s.rawCount + 1, lastRawAccuracy: accuracy })),
  acknowledgeNewRecords: () => set({ lastNewRecords: [] }),
}));
