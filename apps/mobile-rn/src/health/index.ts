// Singleton health adapter (sport-agnostic).
// Phase 7 / P7-A-01..03.
//
// По умолчанию — Mock; на реальном устройстве в Phase 7.1 будет:
//   - Platform.OS === 'ios' → HealthKitAdapter (через react-native-health
//     или expo-health-kit, ещё не выбрано)
//   - Platform.OS === 'android' → HealthConnectAdapter (react-native-health-connect)

import type { HealthAdapter } from './HealthAdapter';
import { MockHealthAdapter } from './MockHealthAdapter';

let active: HealthAdapter = new MockHealthAdapter();

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
