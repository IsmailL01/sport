// Публичный API location-слоя.
// Внешний код использует только interface + готовый singleton.
// Импорт expo-location / expo-task-manager напрямую — только в `./adapters/`.

import { ExpoLocationAdapter } from './adapters/ExpoLocationAdapter';

export type { LocationAdapter } from './LocationAdapter';

/**
 * Singleton LocationAdapter для приложения. Подменить на mock в тестах
 * можно через DI-сценарий (Phase 2+) — пока используем module-level instance.
 */
export const locationAdapter = new ExpoLocationAdapter();
