// Singleton health adapter (sport-agnostic).
// Phase 7 / P7-A-01..03.
//
// По умолчанию — Mock; на реальном устройстве в Phase 7.1 будет:
//   - Platform.OS === 'ios' → HealthKitAdapter (через react-native-health
//     или expo-health-kit, ещё не выбрано)
//   - Platform.OS === 'android' → HealthConnectAdapter (react-native-health-connect)

import { Platform } from 'react-native';

import type { HealthAdapter } from './HealthAdapter';
import { MockHealthAdapter } from './MockHealthAdapter';
import { HealthConnectAdapter } from './HealthConnectAdapter';
import { HealthKitAdapter } from './HealthKitAdapter';

function pickDefault(): HealthAdapter {
  if (Platform.OS === 'android') {
    // Native пакет может отсутствовать (Expo Go) — adapter сам деградирует
    // до stub-режима. isAvailable() вернёт false, UI покажет disabled.
    return new HealthConnectAdapter();
  }
  if (Platform.OS === 'ios') {
    return new HealthKitAdapter();
  }
  return new MockHealthAdapter();
}

let active: HealthAdapter = pickDefault();

export function getHealthAdapter(): HealthAdapter {
  return active;
}

export function setHealthAdapter(adapter: HealthAdapter): void {
  active = adapter;
}

export type {
  HealthAdapter,
  HealthPermissionScope,
  HealthPlatform,
  HealthWorkout,
  ImportedWorkout,
} from './HealthAdapter';
export { MockHealthAdapter } from './MockHealthAdapter';
export { HealthConnectAdapter } from './HealthConnectAdapter';
export { HealthKitAdapter } from './HealthKitAdapter';
export { StravaAdapter } from './StravaAdapter';
