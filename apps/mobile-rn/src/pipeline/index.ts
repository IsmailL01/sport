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
 * Конфиг подобран эмпирически после полевых тестов на планшете:
 *  - AccuracyFilter 50м (было 20м): планшеты часто дают accuracy 30-60м, особенно
 *    в первые секунды после GPS lock и в зданиях. Порог 20м отбрасывал ВСЕ точки.
 *  - JumpFilter 50м/<3с (было 30м/<5с): рост порога вместе с accuracy; короче
 *    окно — быстрее восстанавливаемся после реального обнаружения скачка.
 *  - MinSegmentFilter 1м (было 2м): меньше потерь медленной ходьбы.
 *
 * Эти значения должны быть пересмотрены после тестов на хорошем GPS (телефон).
 */
export function createDefaultPipeline(hooks?: PipelineHooks): Pipeline {
  return new Pipeline(
    [
      new AccuracyFilter(50),
      new KalmanFilter(0.25),
      new JumpFilter(50, 3),
      new MinSegmentFilter(1),
    ],
    hooks,
  );
}
