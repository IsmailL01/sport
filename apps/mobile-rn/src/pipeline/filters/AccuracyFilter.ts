import type { Point } from '../../domain/types';
import type { Filter } from '../Filter';

/**
 * Отбрасывает точки с горизонтальной точностью хуже порога. ТЗ §4.3 (1).
 * По умолчанию 20 метров — соответствует FR-004.
 */
export class AccuracyFilter implements Filter {
  readonly name = 'AccuracyFilter';

  constructor(private readonly maxAccuracyM: number = 20) {}

  apply(point: Point): Point | null {
    if (point.accuracy === null) return point; // нет accuracy — пропускаем
    return point.accuracy > this.maxAccuracyM ? null : point;
  }

  reset(): void {
    // stateless
  }
}
