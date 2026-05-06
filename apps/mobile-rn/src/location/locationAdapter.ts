import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import type { RawPoint } from '../domain/types';
import { useActivityStore } from '../state/activity';

const TASK_NAME = 'BACKGROUND_LOCATION_TASK';

/**
 * Background location task. Регистрируется один раз при загрузке модуля.
 * Дёргает activity store напрямую, потому что в headless контексте
 * (приложение в фоне / killed) у нас нет React component lifecycle.
 *
 * См. ТЗ §4.4 — стратегия background для iOS/Android.
 */
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  TASK_NAME,
  async ({ data, error }) => {
    if (error) {
      console.error('[location task] error:', error);
      return;
    }
    if (!data || !data.locations) return;
    const store = useActivityStore.getState();
    for (const loc of data.locations) {
      store.addPoint(toRawPoint(loc));
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
 * Обёртка над expo-location + expo-task-manager для background-tracking.
 * Listener pattern не нужен — TaskManager сам запушит точки в store.
 */
export class LocationAdapter {
  async start(): Promise<void> {
    const already = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (already) return;
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
      // Adaptive sampling: если стоим — снижается частота (Android only).
      activityType: Location.ActivityType.Fitness,
    });
  }

  async stop(): Promise<void> {
    const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (started) {
      await Location.stopLocationUpdatesAsync(TASK_NAME);
    }
  }

  async isRunning(): Promise<boolean> {
    return Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  }

  /** Запрашивает background permission. Возвращает true если разрешено. */
  async requestBackgroundPermission(): Promise<boolean> {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    return status === 'granted';
  }
}

export const locationAdapter = new LocationAdapter();
