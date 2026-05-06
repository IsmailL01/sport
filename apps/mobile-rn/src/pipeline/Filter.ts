import type { Point } from '../domain/types';

/**
 * Базовый контракт фильтра pipeline.
 * Реализации возвращают:
 *  - `Point` (возможно изменённый) — если точка принимается;
 *  - `null` — если точка должна быть отброшена.
 *
 * См. ТЗ §4.3 (вся pipeline) и §6.1 (Kalman).
 */
export interface Filter {
  /** Имя для логов / телеметрии. */
  readonly name: string;

  /** Обработать точку. */
  apply(point: Point): Point | null;

  /**
   * Сбросить внутреннее состояние (Kalman state, lastAccepted, и т.п.).
   * Вызывается при старте новой сессии записи.
   */
  reset(): void;
}
