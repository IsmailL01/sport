// ExpoLocationAdapter: реализация LocationAdapter через expo-location@19.0.8.
// Phase 1 / PHASE1-11, PHASE1-12. См. ТЗ §4.4 (LocationAdapter), DEVELOPMENT_PLAN.md
// P1-I-02 (iOS SLC) + P1-I-05 (adaptive sampling).
//
// SLC-LIMITATION (D-27, RESEARCH.md §A4):
// Истинный iOS Significant Location Changes (`startMonitoringSignificantLocationChanges`)
// НЕ exposed expo-location@19.0.8. Режим 'background-slc' использует ближайший
// доступный аналог — `Accuracy.Lowest` + `distanceInterval: 500`. Это даёт ~500м
// точность и обновления раз в ~5 минут при движении, что близко к поведению
// реального SLC, но не идентично. Для honest SLC потребуется кастомный нативный
// модуль; Phase 1 принимает аппроксимацию (D-30: Android SLC отсутствует вовсе).
//
// Adaptive sampling (PHASE1-11):
// `setSamplingMode(mode)` идемпотентно перезаписывает конфигурацию таска через
// повторный `Location.startLocationUpdatesAsync(TASK_NAME, opts)`. Stop/start
// НЕ вызывается — это бы добавило 1-2с gap (RESEARCH.md §A5).

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import type { RawPoint } from '../../domain/types';
import { ingestRawPoint } from '../../state/activity';
import type { LocationAdapter, SamplingMode } from '../LocationAdapter';

const TASK_NAME = 'BACKGROUND_LOCATION_TASK';

/**
 * Параметры foreground-service для notification (Android). Переиспользуется
 * во всех modes где трекинг идёт на переднем плане ('active', 'paused').
 * 'background-slc' — iOS-only fallback, foregroundService не нужен.
 */
const FOREGROUND_SERVICE = {
  notificationTitle: 'Запись пробежки',
  notificationBody: 'Running Ecosystem отслеживает вашу позицию.',
  notificationColor: '#10B981',
} as const;

/**
 * Таблица конфигураций для setSamplingMode (PHASE1-11, D-27).
 *
 *  - 'active' — высокоточный режим во время записи; `distanceInterval=0` гарантирует
 *    что точки приходят раз в секунду даже на слабом GPS (jitter <5м иначе бы
 *    "прятал" движения).
 *  - 'paused' — экономичный режим на авто-паузе; обновления только при ≥50м смещения
 *    или раз в 5 секунд. Снижает потребление батареи и сжимает шум на стоянках.
 *  - 'background-slc' — iOS-only аппроксимация SLC (см. SLC-LIMITATION выше).
 *    foregroundService опущен — iOS не использует, Android этот режим не вызывает.
 */
const MODE_OPTIONS: Record<SamplingMode, Location.LocationTaskOptions> = {
  active: {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: 0,
    timeInterval: 1000,
    showsBackgroundLocationIndicator: true,
    foregroundService: FOREGROUND_SERVICE,
    activityType: Location.ActivityType.Fitness,
  },
  paused: {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 50,
    timeInterval: 5000,
    showsBackgroundLocationIndicator: true,
    foregroundService: FOREGROUND_SERVICE,
    activityType: Location.ActivityType.Fitness,
  },
  'background-slc': {
    accuracy: Location.Accuracy.Lowest,
    distanceInterval: 500,
    timeInterval: 0,
  },
};

/**
 * Background location task. Регистрируется один раз при загрузке модуля.
 * Каждая точка прогоняется через GPS pipeline (Accuracy → Kalman → Jump → MinSegment)
 * и только если принята — попадает в activity store.
 *
 * См. ТЗ §4.3 (pipeline), §4.4 (стратегия background).
 */
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  TASK_NAME,
  async ({ data, error }) => {
    if (error) {
      console.error('[location task] error:', error);
      return;
    }
    if (!data || !data.locations) return;
    for (const loc of data.locations) {
      ingestRawPoint(toRawPoint(loc));
    }
  },
);

function toRawPoint(location: Location.LocationObject): RawPoint {
  const { coords, timestamp } = location;
  return {
    timestamp,
    latitude: coords.latitude,
    longitude: coords.longitude,
    altitude: coords.altitude,
    accuracy: coords.accuracy,
    speed: coords.speed,
    heading: coords.heading,
  };
}

/**
 * Реализация LocationAdapter через expo-location + expo-task-manager.
 * Подходит для Phase 0/1: foreground + background через TaskManager.
 * При проблемах с background reliability на китайских OEM — fallback на
 * нативный module (Phase 1 P1-I-04).
 */
export class ExpoLocationAdapter implements LocationAdapter {
  async start(): Promise<void> {
    if (await this.isRunning()) return;
    await Location.startLocationUpdatesAsync(TASK_NAME, MODE_OPTIONS.active);
  }

  async stop(): Promise<void> {
    if (await this.isRunning()) {
      await Location.stopLocationUpdatesAsync(TASK_NAME);
    }
  }

  async isRunning(): Promise<boolean> {
    return Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  }

  async requestForegroundPermission(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  }

  async requestBackgroundPermission(): Promise<boolean> {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    return status === 'granted';
  }

  /**
   * Переключить sampling profile. Идемпотентно: при повторном вызове на том же
   * TASK_NAME expo-location заменяет активную конфигурацию без stop/start
   * (RESEARCH.md §Pattern 5 / A5). Если adapter не запущен — no-op.
   */
  async setSamplingMode(mode: SamplingMode): Promise<void> {
    if (!(await this.isRunning())) return;
    await Location.startLocationUpdatesAsync(TASK_NAME, MODE_OPTIONS[mode]);
  }
}
