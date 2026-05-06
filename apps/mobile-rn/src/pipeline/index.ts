// Публичный API GPS pipeline.
// Стандартная композиция Phase 1 (ТЗ §4.3): Accuracy → Kalman → Jump → MinSegment.
// PauseDetector вызывается отдельно (не часть Pipeline — он не отбрасывает точки).

export { Pipeline, type DropEvent, type PipelineHooks } from './Pipeline';
export type { Filter } from './Filter';
export { AccuracyFilter } from './filters/AccuracyFilter';
export { JumpFilter } from './filters/JumpFilter';
export { MinSegmentFilter } from './filters/MinSegmentFilter';
export { KalmanFilter } from './filters/KalmanFilter';
export { PauseDetector, type PauseEvent } from './filters/PauseDetector';

import { AccuracyFilter } from './filters/AccuracyFilter';
import { JumpFilter } from './filters/JumpFilter';
import { KalmanFilter } from './filters/KalmanFilter';
import { MinSegmentFilter } from './filters/MinSegmentFilter';
import { Pipeline, type PipelineHooks } from './Pipeline';

/**
 * Стандартная pipeline для прототипа Phase 1.
 * Конфиг по умолчанию из FR-004 / FR-005 / ТЗ §6.1.
 */
export function createDefaultPipeline(hooks?: PipelineHooks): Pipeline {
  return new Pipeline(
    [
      new AccuracyFilter(20),
      new KalmanFilter(0.25),
      new JumpFilter(30, 5),
      new MinSegmentFilter(2),
    ],
    hooks,
  );
}
