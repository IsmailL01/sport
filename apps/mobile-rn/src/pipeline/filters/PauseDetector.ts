import type { Point } from '../../domain/types';

export type PauseEvent = {
  type: 'auto-paused' | 'auto-resumed';
  timestamp: number;
};

/**
 * Авто-пауза с гистерезисом. ТЗ §6.4 / FR-010, FR-011:
 *  - paused если 5с подряд speed < 0.5 м/с
 *  - resumed если 2с подряд speed > 1.5 м/с
 *
 * Не отбрасывает точки — только эмитит события через listener.
 * Не часть Pipeline (тот занимается drop+modify), вызывается параллельно
 * на каждой принятой точке.
 */
export class PauseDetector {
  private buffer: { ts: number; speed: number }[] = [];
  private isPaused = false;

  constructor(
    private readonly listener: (event: PauseEvent) => void,
    private readonly pauseSpeedMs: number = 0.5,
    private readonly pauseWindowMs: number = 5_000,
    private readonly resumeSpeedMs: number = 1.5,
    private readonly resumeWindowMs: number = 2_000,
  ) {}

  observe(point: Point): void {
    const speed = point.speed ?? 0;
    this.buffer.push({ ts: point.timestamp, speed });

    // Чистим всё что старше большего из двух окон.
    const oldest = point.timestamp - Math.max(this.pauseWindowMs, this.resumeWindowMs);
    while (this.buffer.length > 0 && this.buffer[0].ts < oldest) {
      this.buffer.shift();
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
      if (allSlow) {
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
  }

  get paused(): boolean {
    return this.isPaused;
  }
}
