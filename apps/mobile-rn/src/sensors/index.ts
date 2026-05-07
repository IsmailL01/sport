// Публичный API sensor-слоя.

export type {
  ConnectionStatus,
  DiscoveredSensor,
  SensorAdapter,
  SensorReading,
  SensorType,
} from './SensorAdapter';

import { MockSensorAdapter } from './adapters/MockSensorAdapter';
import type { SensorAdapter } from './SensorAdapter';

/**
 * Singleton SensorAdapter для приложения.
 * Сейчас — Mock. Когда настроим react-native-ble-plx + найдётся реальный
 * HR-сенсор для теста — заменить на `new BleSensorAdapter()` (тут же).
 */
export const sensorAdapter: SensorAdapter = new MockSensorAdapter();

export { parseHeartRateMeasurement } from './adapters/BleSensorAdapter';
