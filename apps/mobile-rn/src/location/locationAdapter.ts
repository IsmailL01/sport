import * as Location from 'expo-location';
import type { RawPoint } from '../domain/types';

export type LocationListener = (point: RawPoint) => void;

/**
 * Обёртка над expo-location. Скрывает платформенные детали от UI и state.
 * В Phase 1 заменяется полноценным `LocationAdapter` интерфейсом
 * (см. ТЗ §3.3 sensor-agnostic).
 */
export class LocationAdapter {
  private subscription: Location.LocationSubscription | null = null;

  async start(listener: LocationListener): Promise<void> {
    this.subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 5,
        timeInterval: 1000,
      },
      (location) => {
        listener(toRawPoint(location));
      },
    );
  }

  stop(): void {
    this.subscription?.remove();
    this.subscription = null;
  }

  isRunning(): boolean {
    return this.subscription !== null;
  }
}

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

export const locationAdapter = new LocationAdapter();
