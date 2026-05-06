import type { Point } from '../../domain/types';
import { haversineDistance } from '../../util/geo';
import type { Filter } from '../Filter';

/**
 * Отбрасывает точки слишком близкие к предыдущей принятой. ТЗ §4.3 (5).
 * По умолчанию 2 метра. Снижает шум на стоянках и shake-эффекты.
 */
export class MinSegmentFilter implements Filter {
  readonly name = 'MinSegmentFilter';

  private lastAccepted: Point | null = null;

  constructor(private readonly minDistanceM: number = 2) {}

  apply(point: Point): Point | null {
    const prev = this.lastAccepted;
    if (prev === null) {
      this.lastAccepted = point;
      return point;
    }
    const dist = haversineDistance(prev, point);
    if (dist < this.minDistanceM) {
      return null; // не сдвинулись достаточно — пропускаем
    }
    this.lastAccepted = point;
    return point;
  }

  reset(): void {
    this.lastAccepted = null;
  }
}
