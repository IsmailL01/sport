import type { Point, RawPoint } from '../domain/types';
import type { Filter } from './Filter';

export type DropEvent = {
  filterName: string;
  point: Point;
  /** Заполняется фильтром если есть подробности (например "dist=42m, dt=2.1s"). */
  reason?: string;
};

export type PipelineHooks = {
  /**
   * Вызывается когда фильтр отбросил точку. Используется для логов и телеметрии,
   * не должен ничего модифицировать.
   */
  onDrop?: (event: DropEvent) => void;
};

/**
 * Композитор фильтров.
 * Применяет фильтры по порядку; первый возвращающий null прерывает обработку.
 *
 * Стандартный порядок Phase 1 (см. ТЗ §4.3):
 *   AccuracyFilter → KalmanFilter → JumpFilter → MinSegmentFilter
 *
 * `PauseDetector` — отдельный sidecar, не часть pipeline (он не отбрасывает точки,
 * а только эмитит события паузы/возобновления).
 */
export class Pipeline {
  constructor(
    private readonly filters: Filter[],
    private readonly hooks: PipelineHooks = {},
  ) {}

  process(raw: RawPoint): Point | null {
    let point: Point = { ...raw, source: 'raw' };
    for (const filter of this.filters) {
      const result = filter.apply(point);
      if (result === null) {
        this.hooks.onDrop?.({ filterName: filter.name, point });
        return null;
      }
      point = result;
    }
    return point;
  }

  reset(): void {
    for (const filter of this.filters) filter.reset();
  }
}
