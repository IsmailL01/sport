// Zustand-обёртка над SessionManager (PHASE1-07 / D-09 Phase A).
//
// Раньше этот файл был 466-строчным «god-store'ом», который мешал в одном
// месте: state-машину, pipeline-singleton'ы, IO в SQLite, calorie/records/wallet
// оркестрацию и zustand-actions. После рефакторинга он стал тонкой обёрткой:
//   1. Конструирует pipeline / PauseDetector / ClosureDetector (как раньше).
//   2. Строит конкретный SessionRepo из repo-модулей storage/.
//   3. Создаёт ровно один SessionManager на module-level, прокидывает
//      `() => useActivityStore.setState(manager.snapshot())` как onChange.
//   4. Экспортирует useActivityStore с полями из снимка manager'а и actions,
//      которые делегируют в manager.
//   5. Оркестрирует cross-cutting concerns (wallet / records / calories), которые
//      жёстко завязаны на zustand-сторы (useSettingsStore, useAuthStore,
//      useWalletStore) — это делается ПОСЛЕ `manager.stop()` через
//      `finalizeSession` follow-up update. Эта часть остаётся в Phase A здесь;
//      Phase B (см. D-09) может убрать её в выделенный orchestrator.
//
// UI-контракт не меняется: ровно те же поля сна́пшота, что были до рефакторинга
// (см. ActivityStore type ниже), читаются селекторами useActivityStore(s => ...).

import { AppState, type AppStateStatus } from 'react-native';
import { create } from 'zustand';

import type { AreaWarning } from '../domain/AreaCalculator';
import { calculateArea } from '../domain/AreaCalculator';
import { ClosureDetector } from '../domain/ClosureDetector';
import { estimateCaloriesBest } from '../domain/calories';
import type { Lap } from '../domain/lap';
import { detectNewRecords, type PersonalRecord } from '../domain/records';
import { SessionManager, type SessionRepo } from '../domain/session/SessionManager';
import type { ActivityState, ActivityType, Point, RawPoint } from '../domain/types';
import { locationAdapter } from '../location';
import { createDefaultPipeline, PauseDetector, type PauseEvent } from '../pipeline';
import {
  appendLapsForSession,
} from '../storage/lapRepository';
import {
  appendPoints,
  loadPointsForSession,
} from '../storage/pointRepository';
import {
  getCurrentValuesByKind,
  upsertRecord,
} from '../storage/recordsRepository';
import {
  aggregateHrForSession,
} from '../storage/sensorRepository';
import {
  createSession,
  deleteSession,
  finalizeSession,
  findActiveSession,
} from '../storage/sessionRepository';
import { useAuthStore } from './auth';
import { useSettingsStore } from './settings';
import { useWalletStore } from './wallet';

// ── Public store type (unchanged contract for UI) ────────────────────────────

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
  /** Wall-clock ms when current pause began (null when not paused). 2026-05-25. */
  pausedAt: number | null;
  /** Cumulative pause time across all pause cycles in current session (ms). 2026-05-25. */
  pausedDurationMs: number;
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

// ── Module-level wiring ──────────────────────────────────────────────────────

const pipeline = createDefaultPipeline({
  onDrop: (event) => {
    if (__DEV__) {
      console.log(`[pipeline] dropped by ${event.filterName}`);
    }
    manager.incrementDropped(event.filterName);
  },
});

const pauseDetector = new PauseDetector(
  (event: PauseEvent) => {
    manager.setPaused(event.type === 'auto-paused');
    if (__DEV__) {
      console.log(`[pause] ${event.type}`);
    }
  },
  0.5, // pauseSpeedMs (default)
  5_000, // pauseWindowMs (default)
  1.5, // resumeSpeedMs (default)
  2_000, // resumeWindowMs (default)
  // 2026-05-25: warmup gate — suppress auto-paused during GPS-lock period at
  // session start. Symptom user reported: "ПРОДОЛЖИТЬ" button visible right
  // after pressing СТАРТ because runner is stationary while satellites lock.
  // Exits warmup on EITHER 10s elapsed OR 2m moved since first observed point.
  { warmupMs: 10_000, warmupMeters: 2 },
);

const closureDetector = new ClosureDetector((event) => {
  manager.setClosureFired();
  // Сразу пересчитываем площадь по AreaCalculator (с warnings).
  const snap = manager.snapshot();
  const result = calculateArea(snap.points);
  manager.setArea(result.areaM2, result.warnings);
  if (__DEV__) {
    console.log(
      `[closure] fired (dist=${event.totalDistanceM.toFixed(0)}m, gap=${event.closeGapM.toFixed(0)}m, area=${result.areaM2?.toFixed(0)}m²)`,
    );
  }
});

const repo: SessionRepo = {
  createSession,
  finalizeSession,
  deleteSession,
  findActiveSession,
  appendPoints,
  loadPointsForSession,
  appendLapsForSession,
  aggregateHrForSession: (sid) => {
    const r = aggregateHrForSession(sid);
    return { avgHrBpm: r.avgHrBpm, maxHrBpm: r.maxHrBpm };
  },
};

// `lastNewRecords` НЕ покрывается snapshot'ом SessionManager'а (это пост-фактум
// побочка stop()). Держим её отдельно — wrapper устанавливает её после stop().
let pendingLastNewRecords: PersonalRecord[] = [];

const manager = new SessionManager(
  pipeline,
  pauseDetector,
  closureDetector,
  repo,
  locationAdapter,
  // gpsGapTriggerS читается lazily при каждом foreground'е (D-31).
  () => useSettingsStore.getState().gpsGapTriggerS,
  () => {
  // Любая мутация в manager синхронизируется со store. lastNewRecords
  // переносим из pendingLastNewRecords чтобы UI получил их когда они
  // выставлены wrapper'ом сразу после manager.stop().
  const snap = manager.snapshot();
  useActivityStore.setState({
    state: snap.state,
    points: snap.points,
    startedAt: snap.startedAt,
    endedAt: snap.endedAt,
    sessionId: snap.sessionId,
    bufferedCount: snap.bufferedCount,
    rawCount: snap.rawCount,
    droppedCount: snap.droppedCount,
    lastDropFilter: snap.lastDropFilter,
    lastRawAccuracy: snap.lastRawAccuracy,
    isPaused: snap.isPaused,
    pausedAt: snap.pausedAt,
    pausedDurationMs: snap.pausedDurationMs,
    closureFired: snap.closureFired,
    areaM2: snap.areaM2,
    areaWarnings: snap.areaWarnings,
    activityType: snap.activityType,
    laps: snap.laps,
    lapStartIdx: snap.lapStartIdx,
  });
  },
);

// ── AppState gap-resume listener (Phase 1 / PHASE1-12, D-29..D-31) ──────────
//
// iOS edge case: foreground service может быть killed в background — точки
// перестают идти. Когда пользователь возвращается в приложение, проверяем
// gap между последней точкой и now; если > `gpsGapTriggerS` секунд —
// сбрасываем pipeline (Kalman re-init на первой новой точке). Gap НЕ
// интерполируется — пользователь видит провал на треке (D-29).
//
// Listener регистрируется один раз на module-init. unsubscribe не нужен —
// модуль живёт всю жизнь app process'а.

AppState.addEventListener('change', (next: AppStateStatus) => {
  if (next !== 'active') return;
  manager.handleAppForeground();
});

// ── Wrapper-level orchestration (D-09 Phase A leftover) ──────────────────────

/**
 * После manager.stop(): wallet / records / calories считаются здесь, потому что
 * зависят от zustand-сторов (useSettingsStore.athlete, useAuthStore.user,
 * useWalletStore.awardForSession). SessionManager pure-domain — он этого не знает.
 *
 * Подход — UPDATE-after-UPDATE: manager уже вызвал finalizeSession с
 * caloriesKcal=null. Мы пересчитываем calories и вызываем finalizeSession
 * второй раз, перезаписывая поле. Также детектируем personal records и
 * выдаём wallet award.
 */
function postStopEnrich(): void {
  const snap = manager.snapshot();
  if (snap.sessionId === null || snap.startedAt === null || snap.endedAt === null) return;
  const sessionId = snap.sessionId;
  const startedAt = snap.startedAt;
  const endedAt = snap.endedAt;
  const distance = snap.distanceM;
  const points = snap.points;
  const activityType = snap.activityType;
  const durationS = (endedAt - startedAt) / 1000;
  // Take latest HR aggregate from repo (manager already wrote one, but reads
  // are cheap and ensure we have the freshest value).
  let avgHrBpm: number | null = null;
  let maxHrBpm: number | null = null;
  try {
    const hr = repo.aggregateHrForSession(sessionId);
    avgHrBpm = hr.avgHrBpm;
    maxHrBpm = hr.maxHrBpm;
  } catch (e) {
    console.warn('[activity] aggregateHrForSession failed', e);
  }
  // Калории — best-of MET vs HR-based.
  const athlete = useSettingsStore.getState().athlete;
  const caloriesKcal = estimateCaloriesBest(
    activityType,
    athlete,
    avgHrBpm,
    durationS,
    distance,
  );
  // Записываем обновлённые финалы (overwrites caloriesKcal=null который
  // manager оставил).
  try {
    finalizeSession(sessionId, {
      endedAt,
      isClosed: snap.closureFired,
      distanceM: distance,
      areaM2: snap.areaM2,
      calcMethod: (snap.areaWarnings.includes('self-intersection')
        ? 'shoelace_with_warning'
        : snap.areaM2 !== null
          ? 'shoelace_simple'
          : null) as 'shoelace_simple' | 'shoelace_with_warning' | null,
      avgHrBpm,
      maxHrBpm,
      caloriesKcal,
    });
  } catch (e) {
    console.error('[activity] finalizeSession enrich failed', e);
  }
  // Wallet award (idempotent — wallet store сам проверяет двойную выдачу).
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
  // Detect & persist personal records.
  let newRecords: PersonalRecord[] = [];
  try {
    if (distance > 0 && durationS > 0) {
      const current = getCurrentValuesByKind();
      const detected = detectNewRecords(
        {
          sessionId,
          startedAt,
          endedAt,
          distanceM: distance,
          durationS,
          caloriesKcal,
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
  pendingLastNewRecords = newRecords;
  // Push records into store (snapshot already copied other fields via onChange).
  useActivityStore.setState({ lastNewRecords: newRecords });
}

// ── Public ingest entry (called by LocationAdapter) ──────────────────────────

/**
 * Точка входа из LocationAdapter — вызывается на каждом raw-event.
 * Делегирует в SessionManager. UI читает результат через useActivityStore.
 */
export function ingestRawPoint(raw: RawPoint): void {
  manager.ingestRawPoint(raw);
}

// ── Recovery wrapper (kept side-effecting on store for lastNewRecords reset) ──

function doRecoverLast(): void {
  manager.recoverLast();
  // recoverLast → state stopped → ensure lastNewRecords cleared (recovery
  // produces a "viewed" session, not a freshly-broken record).
  useActivityStore.setState({ lastNewRecords: [] });
}

// ── Store factory ────────────────────────────────────────────────────────────

const initial = manager.snapshot();

export const useActivityStore = create<ActivityStore>(() => ({
  state: initial.state,
  points: initial.points,
  startedAt: initial.startedAt,
  endedAt: initial.endedAt,
  sessionId: initial.sessionId,
  bufferedCount: initial.bufferedCount,
  rawCount: initial.rawCount,
  droppedCount: initial.droppedCount,
  lastDropFilter: initial.lastDropFilter,
  lastRawAccuracy: initial.lastRawAccuracy,
  isPaused: initial.isPaused,
  pausedAt: initial.pausedAt,
  pausedDurationMs: initial.pausedDurationMs,
  closureFired: initial.closureFired,
  areaM2: initial.areaM2,
  areaWarnings: initial.areaWarnings,
  lastNewRecords: pendingLastNewRecords,
  activityType: initial.activityType,
  laps: initial.laps,
  lapStartIdx: initial.lapStartIdx,

  start: (activityType = 'run') => {
    manager.start(activityType);
  },
  stop: () => {
    manager.stop();
    postStopEnrich();
  },
  markLap: () => {
    manager.markLap();
  },
  acceptPoint: (point) => {
    manager.acceptPoint(point);
  },
  reset: () => {
    manager.reset();
    pendingLastNewRecords = [];
    useActivityStore.setState({ lastNewRecords: [] });
  },
  recoverLast: doRecoverLast,

  // Internal counters — преимущественно вызываются pipeline / pauseDetector /
  // closureDetector callbacks, не из UI. Делегируем в manager.
  incrementDropped: (filterName) => manager.incrementDropped(filterName),
  setPaused: (paused) => manager.setPaused(paused),
  setClosureFired: () => manager.setClosureFired(),
  setArea: (areaM2, areaWarnings) => manager.setArea(areaM2, areaWarnings),
  noteRaw: (_accuracy) => {
    // SessionManager.ingestRawPoint уже инкрементит rawCount + lastRawAccuracy
    // через свою внутреннюю логику. UI ожидает что noteRaw существует, поэтому
    // оставляем функцию (no-op) для backward-compat.
  },
  acknowledgeNewRecords: () => {
    pendingLastNewRecords = [];
    useActivityStore.setState({ lastNewRecords: [] });
  },
}));
