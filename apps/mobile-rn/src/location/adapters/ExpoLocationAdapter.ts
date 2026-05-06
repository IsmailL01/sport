import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import type { RawPoint } from '../../domain/types';
import { ingestRawPoint } from '../../state/activity';
import type { LocationAdapter } from '../LocationAdapter';

const TASK_NAME = 'BACKGROUND_LOCATION_TASK';

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
    await Location.startLocationUpdatesAsync(TASK_NAME, {
      accuracy: Location.Accuracy.BestForNavigation,
      distanceInterval: 5,
      timeInterval: 1000,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Запись пробежки',
        notificationBody: 'Running Ecosystem отслеживает вашу позицию.',
        notificationColor: '#10B981',
      },
      activityType: Location.ActivityType.Fitness,
    });
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
}
