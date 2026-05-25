import type { Point } from '../../domain/types';
import { haversineDistance } from '../../util/geo';

export type PauseEvent = {
  type: 'auto-paused' | 'auto-resumed';
  timestamp: number;
};

/**
 * GPS warmup gate — suppress `auto-paused` emission while BOTH conditions hold:
 *   1. Elapsed time since first observed point < `warmupMs`
 *   2. Cumulative distance traveled < `warmupMeters`
 *
 * Rationale (2026-05-25): on session start, the user is typically stationary
 * while GPS locks. The 5-second pause window fills with speed~0 readings,
 * triggering an immediate "ПРОДОЛЖИТЬ" button on the live tracker UI before
 * the runner has actually moved. Suppressing the auto-paused emission until
 * EITHER timeout OR motion threshold is crossed eliminates this UX flaw.
 *
 * `auto-resumed` is NEVER suppressed (it can only fire after pause, which is
 * already gated).
 *
 * Set to `null` to disable warmup gating (backward-compat default for tests
 * and pre-existing PauseDetector instantiations).
 */
export type WarmupConfig = {
  warmupMs: number;
  warmupMeters: number;
};

/**
 * Авто-пауза с гистерезисом. ТЗ §6.4 / FR-010, FR-011:
 *  - paused если 5с подряд speed < 0.5 м/с
 *  - resumed если 2с подряд speed > 1.5 м/с
 *
 * 2026-05-25: optional warmup gate to suppress auto-paused during GPS lock
 * phase at session start. See WarmupConfig docs above.
 *
 * Не отбрасывает точки — только эмитит события через listener.
 * Не часть Pipeline (тот занимается drop+modify), вызывается параллельно
 * на каждой принятой точке.
 */
export class PauseDetector {
  private buffer: { ts: number; speed: number }[] = [];
  private isPaused = false;
  // Warmup state — tracked only when warmup config is provided.
  private firstObservedTs: number | null = null;
  private distanceTraveled = 0;
  private prevObservedPoint: Point | null = null;

  constructor(
    private readonly listener: (event: PauseEvent) => void,
    private readonly pauseSpeedMs: number = 0.5,
    private readonly pauseWindowMs: number = 5_000,
    private readonly resumeSpeedMs: number = 1.5,
    private readonly resumeWindowMs: number = 2_000,
    private readonly warmup: WarmupConfig | null = null,
  ) {}

  observe(point: Point): void {
    const speed = point.speed ?? 0;
    this.buffer.push({ ts: point.timestamp, speed });

    // Чистим всё что старше большего из двух окон.
    const oldest = point.timestamp - Math.max(this.pauseWindowMs, this.resumeWindowMs);
    while (this.buffer.length > 0 && this.buffer[0].ts < oldest) {
      this.buffer.shift();
    }

    // Warmup tracking (only if warmup config provided).
    if (this.warmup !== null) {
      if (this.firstObservedTs === null) {
        this.firstObservedTs = point.timestamp;
      } else if (this.prevObservedPoint !== null) {
        this.distanceTraveled += haversineDistance(this.prevObservedPoint, point);
      }
      this.prevObservedPoint = point;
    }

    if (!this.isPaused) {
      // Достаточно данных за pauseWindow и все ниже порога?
      const windowStart = point.timestamp - this.pauseWindowMs;
      const window = this.buffer.filter((s) => s.ts >= windowStart);
      const enoughData =
        window.length > 0 &&
        window[0].ts <= windowStart + 500 &&
        window[window.length - 1].ts >= point.timestamp - 100;
      const allSlow =
        enoughData && window.every((s) => s.speed < this.pauseSpeedMs);
      if (allSlow && !this.inWarmup(point.timestamp)) {
        this.isPaused = true;
        this.listener({ type: 'auto-paused', timestamp: point.timestamp });
      }
    } else {
      const windowStart = point.timestamp - this.resumeWindowMs;
      const window = this.buffer.filter((s) => s.ts >= windowStart);
      const enoughData =
        window.length > 0 &&
        window[0].ts <= windowStart + 200 &&
        window[window.length - 1].ts >= point.timestamp - 100;
      const allFast =
        enoughData && window.every((s) => s.speed > this.resumeSpeedMs);
      if (allFast) {
        this.isPaused = false;
        this.listener({ type: 'auto-resumed', timestamp: point.timestamp });
      }
    }
  }

  reset(): void {
    this.buffer = [];
    this.isPaused = false;
    this.firstObservedTs = null;
    this.distanceTraveled = 0;
    this.prevObservedPoint = null;
  }

  get paused(): boolean {
    return this.isPaused;
  }

  /**
   * True while still in GPS-warmup window — auto-paused emission is suppressed.
   * Returns false if no warmup config was provided. User exits warmup when
   * EITHER `warmupMs` elapsed since first observed point OR cumulative
   * `warmupMeters` distance traveled.
   */
  private inWarmup(currentTs: number): boolean {
    if (this.warmup === null) return false;
    if (this.firstObservedTs === null) return true;
    const elapsed = currentTs - this.firstObservedTs;
    const elapsedExpired = elapsed >= this.warmup.warmupMs;
    const distanceCrossed = this.distanceTraveled >= this.warmup.warmupMeters;
    return !elapsedExpired && !distanceCrossed;
  }
}
