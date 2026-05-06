// Детектор замыкания трека (ТЗ §6.5, P1-G-01).
// Следит за условием: длина >200м И dist(first,last) <20м. При выполнении
// эмитит событие один раз; повторных эмитов не будет, пока не сбросим.

import type { RawPoint } from './types';
import { haversineDistance, totalDistance } from '../util/geo';

const DEFAULT_MIN_DISTANCE_M = 200;
const DEFAULT_CLOSE_DISTANCE_M = 20;

export type ClosureEvent = {
  totalDistanceM: number;
  closeGapM: number;
};

export class ClosureDetector {
  private fired = false;

  constructor(
    private readonly listener: (event: ClosureEvent) => void,
    private readonly minDistanceM: number = DEFAULT_MIN_DISTANCE_M,
    private readonly closeDistanceM: number = DEFAULT_CLOSE_DISTANCE_M,
  ) {}

  /**
   * Вызывать при изменении трека (на каждой принятой точке или throttled).
   * Если условие замыкания выполнено впервые — эмитит событие.
   */
  check(points: readonly RawPoint[]): void {
    if (this.fired) return;
    if (points.length < 3) return;
    const dist = totalDistance(points);
    if (dist < this.minDistanceM) return;
    const gap = haversineDistance(points[0], points[points.length - 1]);
    if (gap >= this.closeDistanceM) return;
    this.fired = true;
    this.listener({ totalDistanceM: dist, closeGapM: gap });
  }

  reset(): void {
    this.fired = false;
  }

  get isFired(): boolean {
    return this.fired;
  }
}
