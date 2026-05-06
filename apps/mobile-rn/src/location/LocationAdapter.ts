// Интерфейс источника гео-позиции. Domain-код и pipeline зависят от него,
// конкретная реализация (expo-location, native, mock) подменяется через DI/singleton.
// См. ТЗ §3 принцип 3 (sensor-agnostic), §4.4 (LocationAdapter).

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
}
