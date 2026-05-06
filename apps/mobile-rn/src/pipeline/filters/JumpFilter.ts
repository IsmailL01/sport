import type { Point } from '../../domain/types';
import { haversineDistance } from '../../util/geo';
import type { Filter } from '../Filter';

/**
 * Отбрасывает «прыжки» — точки на расстоянии больше threshold за короткий dt.
 * ТЗ §4.3 (4) / FR-005: dist > 30м при Δt < 5с.
 *
 * Защищает от GPS-артефактов (особенно в городском каньоне).
 */
export class JumpFilter implements Filter {
  readonly name = 'JumpFilter';

  private lastAccepted: Point | null = null;

  constructor(
    private readonly maxDistanceM: number = 30,
    private readonly maxDtSeconds: number = 5,
  ) {}

  apply(point: Point): Point | null {
    const prev = this.lastAccepted;
    if (prev === null) {
      this.lastAccepted = point;
      return point;
    }
    const dt = (point.timestamp - prev.timestamp) / 1000;
    if (dt < this.maxDtSeconds) {
      const dist = haversineDistance(prev, point);
      if (dist > this.maxDistanceM) {
        // Не обновляем lastAccepted — следующая точка сравнивается с предыдущей принятой.
        return null;
      }
    }
    this.lastAccepted = point;
    return point;
  }

  reset(): void {
    this.lastAccepted = null;
  }
}
