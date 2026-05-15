// Интерфейс источника гео-позиции. Domain-код и pipeline зависят от него,
// конкретная реализация (expo-location, native, mock) подменяется через DI/singleton.
// См. ТЗ §3 принцип 3 (sensor-agnostic), §4.4 (LocationAdapter).

/**
 * Режимы adaptive sampling (Phase 1 / PHASE1-11, D-27).
 *  - 'active' — высокоточный режим записи (BestForNavigation, 1Hz).
 *  - 'paused' — экономичный режим во время авто-паузы (Balanced, 50м).
 *  - 'background-slc' — iOS-only приближение Significant Location Changes
 *     (Accuracy.Lowest + distanceInterval 500м). Истинный SLC недоступен в
 *     expo-location@19.0.8; см. ExpoLocationAdapter module header.
 */
export type SamplingMode = 'active' | 'paused' | 'background-slc';

export interface LocationAdapter {
  /**
   * Запустить трекинг позиции. После этого реализация будет пушить точки
   * в `useActivityStore.getState().addPoint(...)` напрямую — в RN это нужно
   * потому что TaskManager-таск работает в headless контексте без React lifecycle.
   *
   * Идемпотентно: повторный вызов когда уже запущено — no-op.
   */
  start(): Promise<void>;

  /**
   * Остановить трекинг. Идемпотентно.
   */
  stop(): Promise<void>;

  /**
   * Запущен ли трекинг прямо сейчас (включая background-режим).
   */
  isRunning(): Promise<boolean>;

  /**
   * Запросить foreground-permission на гео. Должно вызываться до start().
   */
  requestForegroundPermission(): Promise<boolean>;

  /**
   * Запросить background-permission ("Always" на iOS / "Allow all the time" на Android).
   * На iOS требует, чтобы foreground уже был дан. Best effort — возвращает false если отказали.
   */
  requestBackgroundPermission(): Promise<boolean>;

  /**
   * Переключить sampling profile без stop/start (Phase 1 / PHASE1-11, D-27).
   * По умолчанию — 'active'. Реализация идемпотентна на одном и том же TASK_NAME:
   * повторный вызов `startLocationUpdatesAsync` заменяет активную конфигурацию
   * без 1-2-секундного gap'а (RESEARCH.md §Pattern 5, A5).
   *
   * Когда adapter НЕ запущен — no-op (не стартует новую запись).
   */
  setSamplingMode(mode: SamplingMode): Promise<void>;
}
