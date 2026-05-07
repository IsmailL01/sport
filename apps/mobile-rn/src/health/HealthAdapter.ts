// HealthAdapter — sport-agnostic abstraction над платформенными health-сервисами
// (Apple HealthKit / Android Health Connect).
// ТЗ §3 принцип 10 (всё через адаптеры) / Phase 7 / P7-A-01..03.
//
// Архитектура такая же как у LocationAdapter и SensorAdapter:
//   - один контракт (interface)
//   - mock-first для dev/тестов
//   - real platform impl за config plugin (требует dev/preview build,
//     не работает в Expo Go)
//
// Сейчас:
//   - MockHealthAdapter (in-memory) — для unit-тестов и CI
//   - HealthKitAdapter / HealthConnectAdapter — TODO Phase 7.1, требуют
//     react-native-health (iOS) и react-native-health-connect (Android)
//     или Expo equivalent

export type HealthPlatform = 'apple-health' | 'health-connect' | 'mock';

/**
 * Что мы экспортируем в платформу. Соответствует workout-у в HealthKit /
 * exercise-сессии в Health Connect.
 */
export type HealthWorkout = {
  /** Уникальный ID нашего sessions table (для дедупликации при повторной отправке). */
  externalId: string;
  /** Стартовое время. */
  startedAt: number;
  /** Конечное время. */
  endedAt: number;
  /** Дистанция в метрах. */
  distanceM: number;
  /** Калории сожжено (опционально). */
  calories?: number | null;
  /** Средний HR (если есть). */
  avgHrBpm?: number | null;
  /** Тип активности; пока всегда running. */
  activityType: 'running' | 'walking' | 'cycling' | 'other';
};

/**
 * Что мы импортируем из платформы — workout, который пользователь записал
 * в часах / другом приложении и который мы хотим показать в нашем UI.
 */
export type ImportedWorkout = HealthWorkout & {
  /** Платформа-источник. */
  source: HealthPlatform;
  /** ID на стороне платформы (для дедупа при повторных импортах). */
  sourceUuid: string;
};

export type HealthPermissionScope = 'read-workouts' | 'write-workouts' | 'read-hr';

export interface HealthAdapter {
  /** Какая платформа поддерживается (для UI: показать "Apple Health" / "Health Connect"). */
  platform(): HealthPlatform;

  /** Доступна ли платформа на этом устройстве/версии ОС. */
  isAvailable(): Promise<boolean>;

  /** Запросить разрешения у пользователя. true = все scopes выданы. */
  requestPermissions(scopes: HealthPermissionScope[]): Promise<boolean>;

  /** Какие из scopes уже выданы (без повторного prompt). */
  grantedScopes(): Promise<HealthPermissionScope[]>;

  /**
   * Записать workout в платформу.
   * Идемпотентность по externalId — если уже есть, обновить.
   */
  writeWorkout(workout: HealthWorkout): Promise<void>;

  /**
   * Прочитать workouts из платформы за период.
   * Используется при первичной синхронизации после connect.
   */
  readWorkouts(sinceMs: number): Promise<ImportedWorkout[]>;
}
