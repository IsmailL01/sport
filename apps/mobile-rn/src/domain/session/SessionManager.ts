// SessionManager: pure imperative lifecycle owner (start/pause/resume/ingestRawPoint/markLap/stop/save/discard/recover).
// Phase 1 / PHASE1-07. См. ТЗ §4.3 (pipeline ownership), §4.5 (crash recovery), DEVELOPMENT_PLAN.md P1-C-01.
// Domain-pure: НЕ зависит от Mapbox / SQLite / zustand / React. Repos и pipeline инжектятся через constructor.
//
// Архитектурно эквивалентен imperative-блокам в src/state/activity.ts:103-456,
// но вынесен в чистый класс. Wrapper (useActivityStore в state/activity.ts)
// инстанцирует один manager на module-level и делегирует start/stop/markLap/etc.
// onChange-колбэк дёргается после каждой мутации — wrapper копирует
// `manager.snapshot()` в zustand store.
//
// Перенос wallet/records/calories из stop()-логики — Phase B (D-09); сейчас
// SessionManager.stop() ограничен distance / area / HR aggregate / finalize.
// Wrapper после `manager.stop()` читает snapshot и оркестрирует калории/wallet/records.

import { calculateArea, type AreaWarning } from '../AreaCalculator';
import { ClosureDetector } from '../ClosureDetector';
import { lapFromRange, type Lap } from '../lap';
import type { ActivityType, Point, RawPoint, Session } from '../types';
import { PauseDetector } from '../../pipeline/filters/PauseDetector';
import { Pipeline } from '../../pipeline/Pipeline';
import { isClosed, totalDistance } from '../../util/geo';

const FLUSH_THRESHOLD = 10;
const AREA_RECOMPUTE_INTERVAL_MS = 30_000;

// ── Public types ─────────────────────────────────────────────────────────────

export type ActivityState = 'idle' | 'recording' | 'stopped';

/**
 * Минимальный контракт сторадж-слоя, который нужен SessionManager.
 * Реализация в wrapper'е (state/activity.ts) комбинирует sessionRepository +
 * pointRepository + lapRepository + sensorRepository.
 */
export interface SessionRepo {
  createSession(s: { id: number; startedAt: number; activityType: ActivityType }): void;
  finalizeSession(
    sid: number,
    finals: {
      endedAt: number;
      isClosed: boolean | null;
      distanceM: number;
      areaM2: number | null;
      calcMethod: string | null;
      avgHrBpm: number | null;
      maxHrBpm: number | null;
      caloriesKcal: number | null;
    },
  ): void;
  deleteSession(sid: number): void;
  findActiveSession(): Session | null;
  appendPoints(sid: number, pts: Point[]): void;
  loadPointsForSession(sid: number): Point[];
  appendLapsForSession(sid: number, laps: Lap[]): void;
  aggregateHrForSession(sid: number): { avgHrBpm: number | null; maxHrBpm: number | null };
}

/**
 * Снимок состояния, который читает wrapper (zustand store) и UI.
 * Поля совпадают с теми, что раньше жили в ActivityStore — это контракт для UI.
 */
export interface SessionSnapshot {
  state: ActivityState;
  sessionId: number | null;
  points: Point[];
  laps: Lap[];
  lapStartIdx: number;
  startedAt: number | null;
  endedAt: number | null;
  distanceM: number;
  areaM2: number | null;
  areaWarnings: AreaWarning[];
  isPaused: boolean;
  closureFired: boolean;
  bufferedCount: number;
  rawCount: number;
  droppedCount: number;
  lastDropFilter: string | null;
  lastRawAccuracy: number | null;
  activityType: ActivityType;
}

// ── Implementation ───────────────────────────────────────────────────────────

export class SessionManager {
  private state: ActivityState = 'idle';
  private sessionId: number | null = null;
  private points: Point[] = [];
  private laps: Lap[] = [];
  private lapStartIdx = 0;
  private startedAt: number | null = null;
  private endedAt: number | null = null;
  private distanceM = 0;
  private areaM2: number | null = null;
  private areaWarnings: AreaWarning[] = [];
  private isPaused = false;
  private closureFired = false;
  private rawCount = 0;
  private droppedCount = 0;
  private lastDropFilter: string | null = null;
  private lastRawAccuracy: number | null = null;
  private activityType: ActivityType = 'run';
  private buffer: Point[] = [];
  private lastAreaRecompute = 0;

  constructor(
    private readonly pipeline: Pipeline,
    private readonly pauseDetector: PauseDetector,
    private readonly closureDetector: ClosureDetector,
    private readonly repo: SessionRepo,
    private readonly onChange: () => void,
  ) {}

  // ── Read API ──────────────────────────────────────────────────────────────

  snapshot(): SessionSnapshot {
    return {
      state: this.state,
      sessionId: this.sessionId,
      points: [...this.points],
      laps: [...this.laps],
      lapStartIdx: this.lapStartIdx,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      distanceM: this.distanceM,
      areaM2: this.areaM2,
      areaWarnings: [...this.areaWarnings],
      isPaused: this.isPaused,
      closureFired: this.closureFired,
      bufferedCount: this.buffer.length,
      rawCount: this.rawCount,
      droppedCount: this.droppedCount,
      lastDropFilter: this.lastDropFilter,
      lastRawAccuracy: this.lastRawAccuracy,
      activityType: this.activityType,
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start(activityType: ActivityType = 'run'): void {
    if (this.state === 'recording') return; // idempotent — no double-start
    const sessionId = Date.now();
    this.buffer = [];
    this.pipeline.reset();
    this.pauseDetector.reset();
    this.closureDetector.reset();
    this.lastAreaRecompute = 0;
    try {
      this.repo.createSession({ id: sessionId, startedAt: sessionId, activityType });
    } catch (e) {
      console.error('[session] createSession failed', e);
    }
    this.state = 'recording';
    this.sessionId = sessionId;
    this.points = [];
    this.laps = [];
    this.lapStartIdx = 0;
    this.startedAt = sessionId;
    this.endedAt = null;
    this.distanceM = 0;
    this.areaM2 = null;
    this.areaWarnings = [];
    this.isPaused = false;
    this.closureFired = false;
    this.rawCount = 0;
    this.droppedCount = 0;
    this.lastDropFilter = null;
    this.lastRawAccuracy = null;
    this.activityType = activityType;
    this.emit();
  }

  stop(): void {
    if (this.state !== 'recording') return;
    this.flushBuffer(true);
    const endedAt = Date.now();
    this.endedAt = endedAt;
    if (this.sessionId !== null) {
      const distance = totalDistance(this.points);
      const closed = isClosed(this.points, distance);
      const areaResult = closed
        ? calculateArea(this.points)
        : { areaM2: null as number | null, method: null as string | null, warnings: [] as AreaWarning[] };
      this.distanceM = distance;
      this.areaM2 = areaResult.areaM2;
      this.areaWarnings = areaResult.warnings;

      // HR aggregate (Phase 5 sensor pipeline). Failure non-fatal.
      let avgHrBpm: number | null = null;
      let maxHrBpm: number | null = null;
      try {
        const hr = this.repo.aggregateHrForSession(this.sessionId);
        avgHrBpm = hr.avgHrBpm;
        maxHrBpm = hr.maxHrBpm;
      } catch (e) {
        console.warn('[session] aggregateHrForSession failed', e);
      }

      // Finalize the session row. caloriesKcal не считаем здесь — wrapper
      // (state/activity.ts) после stop() читает snapshot и оркестрирует
      // wallet/records/calories с учётом athlete profile и user-id (которые
      // живут в zustand-сторах, недоступных pure-domain слою).
      try {
        this.repo.finalizeSession(this.sessionId, {
          endedAt,
          isClosed: closed,
          distanceM: distance,
          areaM2: areaResult.areaM2,
          calcMethod: areaResult.method,
          avgHrBpm,
          maxHrBpm,
          caloriesKcal: null, // wrapper'у — обновить через follow-up finalize если нужно
        });
      } catch (e) {
        console.error('[session] finalizeSession failed', e);
      }

      // Финализируем последний lap (между последним lap-mark'ом и финишем).
      try {
        const tailStart = this.lapStartIdx;
        const allLaps = [...this.laps];
        if (this.points.length - tailStart >= 2) {
          const tail = lapFromRange(this.points, tailStart, this.laps.length + 1);
          if (tail !== null) allLaps.push(tail);
        }
        if (allLaps.length > 0) {
          this.repo.appendLapsForSession(this.sessionId, allLaps);
          this.laps = allLaps;
        }
      } catch (e) {
        console.warn('[session] persist laps failed', e);
      }
    }
    this.state = 'stopped';
    this.isPaused = false;
    this.emit();
  }

  reset(): void {
    if (this.sessionId !== null) {
      try {
        this.repo.deleteSession(this.sessionId);
      } catch (e) {
        console.error('[session] deleteSession failed', e);
      }
    }
    this.buffer = [];
    this.pipeline.reset();
    this.pauseDetector.reset();
    this.closureDetector.reset();
    this.lastAreaRecompute = 0;
    this.state = 'idle';
    this.sessionId = null;
    this.points = [];
    this.laps = [];
    this.lapStartIdx = 0;
    this.startedAt = null;
    this.endedAt = null;
    this.distanceM = 0;
    this.areaM2 = null;
    this.areaWarnings = [];
    this.isPaused = false;
    this.closureFired = false;
    this.rawCount = 0;
    this.droppedCount = 0;
    this.lastDropFilter = null;
    this.lastRawAccuracy = null;
    this.activityType = 'run';
    this.emit();
  }

  // ── Point ingestion ───────────────────────────────────────────────────────

  /**
   * Точка входа из LocationAdapter — вызывается на каждом raw-event.
   * Pipeline → PauseDetector → acceptPoint (если принято).
   */
  ingestRawPoint(raw: RawPoint): void {
    this.rawCount += 1;
    this.lastRawAccuracy = raw.accuracy;
    const accepted = this.pipeline.process(raw);
    if (accepted === null) {
      this.emit();
      return;
    }
    this.pauseDetector.observe(accepted);
    this.acceptPoint(accepted);
  }

  acceptPoint(point: Point): void {
    if (this.state !== 'recording') return;
    this.buffer.push(point);
    this.points = [...this.points, point];
    this.flushBuffer(false);
    // Пробуем детект замыкания и пересчёт площади.
    this.closureDetector.check(this.points);
    this.maybeRecomputeArea();
    this.emit();
  }

  // ── Manual lap-mark (R7 race-safety: synchronous, read-then-mutate в одной call'e) ──

  markLap(): void {
    if (this.state !== 'recording') return;
    if (this.points.length - this.lapStartIdx < 2) return; // нужны ≥2 точки
    const lap = lapFromRange(this.points, this.lapStartIdx, this.laps.length + 1);
    if (lap === null) return;
    // Functional-set эквивалент: читаем this.points сейчас, мутируем this.laps атомарно
    // в пределах синхронного вызова. Никакого awaitable shared state между read и write.
    this.laps = [...this.laps, lap];
    this.lapStartIdx = this.points.length - 1;
    this.emit();
  }

  // ── Recovery ──────────────────────────────────────────────────────────────

  /**
   * После crash recovery (см. ТЗ §4.5): загружаем последнюю незавершённую
   * сессию из репозитория и приводим manager в state='stopped' (НЕ
   * 'recording' — resume-в-recording не поддерживается в Phase 1; см.
   * CONCERNS.md "Crash recovery").
   */
  recoverLast(): void {
    if (this.state !== 'idle') return;
    let session: Session | null = null;
    let pts: Point[] = [];
    try {
      session = this.repo.findActiveSession();
      if (session !== null) {
        pts = this.repo.loadPointsForSession(session.id);
      }
    } catch (e) {
      console.error('[session] recover failed', e);
      return;
    }
    if (session === null || pts.length === 0) return;
    this.buffer = [];
    this.pipeline.reset();
    this.pauseDetector.reset();
    this.closureDetector.reset();
    this.lastAreaRecompute = 0;
    this.state = 'stopped';
    this.sessionId = session.id;
    this.points = pts;
    this.laps = [];
    this.lapStartIdx = 0;
    this.startedAt = session.startedAt;
    this.endedAt = session.endedAt ?? pts[pts.length - 1]?.timestamp ?? null;
    this.distanceM = session.distanceM ?? 0;
    this.areaM2 = session.areaM2;
    this.areaWarnings =
      session.calcMethod === 'shoelace_with_warning' ? ['self-intersection'] : [];
    this.isPaused = false;
    this.closureFired = session.isClosed === true;
    this.rawCount = 0;
    this.droppedCount = 0;
    this.lastDropFilter = null;
    this.lastRawAccuracy = null;
    this.activityType = session.activityType;
    this.emit();
  }

  // ── Auxiliary mutators (called by wrapper from PauseDetector / ClosureDetector callbacks) ──

  /** Установить isPaused (вызывается из PauseDetector callback во wrapper'е). */
  setPaused(isPaused: boolean): void {
    this.isPaused = isPaused;
    this.emit();
  }

  /** Отметить замыкание (вызывается из ClosureDetector callback во wrapper'е). */
  setClosureFired(): void {
    this.closureFired = true;
    this.emit();
  }

  /** Обновить area + warnings (вызывается после AreaCalculator пересчёта во wrapper'е). */
  setArea(areaM2: number | null, warnings: AreaWarning[]): void {
    this.areaM2 = areaM2;
    this.areaWarnings = warnings;
    this.emit();
  }

  /** Счётчик dropped-точек pipeline (вызывается из pipeline onDrop). */
  incrementDropped(filterName: string): void {
    this.droppedCount += 1;
    this.lastDropFilter = filterName;
    this.emit();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private emit(): void {
    this.onChange();
  }

  private flushBuffer(force: boolean): void {
    if (this.sessionId === null) return;
    if (!force && this.buffer.length < FLUSH_THRESHOLD) return;
    if (this.buffer.length === 0) return;
    try {
      this.repo.appendPoints(this.sessionId, this.buffer);
      this.buffer = [];
    } catch (e) {
      console.error('[session] flush failed', e);
    }
  }

  private maybeRecomputeArea(): void {
    if (!this.closureFired) return;
    const now = Date.now();
    if (now - this.lastAreaRecompute < AREA_RECOMPUTE_INTERVAL_MS) return;
    this.lastAreaRecompute = now;
    const result = calculateArea(this.points);
    this.areaM2 = result.areaM2;
    this.areaWarnings = result.warnings;
  }
}
