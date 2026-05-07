// Skeleton для реального BLE-адаптера через react-native-ble-plx.
// Phase 5 / P5-A-01..03 — полная реализация когда будет настоящий HR-сенсор для теста.
//
// Что нужно установить:
//   npx expo install react-native-ble-plx
//   + config plugin (см. https://github.com/dotintent/react-native-ble-plx)
//
// Что нужно реализовать:
//   1. Управлять BleManager (создать, destroy на logout)
//   2. requestPermissions:
//      - iOS: NSBluetoothAlwaysUsageDescription в Info.plist (через app.json)
//      - Android 12+: BLUETOOTH_SCAN, BLUETOOTH_CONNECT runtime permissions
//   3. startScan: BleManager.startDeviceScan по filter UUID 0x180D
//   4. connect: device.connect() → discoverAllServicesAndCharacteristics
//   5. onReading: monitorCharacteristicForDevice('180D', '2A37') →
//      parseHeartRateMeasurement (см. Bluetooth GATT spec):
//        - Flag byte 0: 0=8bit HR, 1=16bit HR
//        - Если bit 1 set — sensor contact supported
//        - Если bit 3 set — energy expended присутствует
//        - Если bit 4 set — RR intervals присутствуют
//
// Для прототипа используем MockSensorAdapter; этот файл — placeholder для
// последующего переключения singleton'а в src/sensors/index.ts.

import type {
  ConnectionListener,
  ConnectionStatus,
  ReadingListener,
  ScanListener,
  SensorAdapter,
} from '../SensorAdapter';

const NOT_IMPLEMENTED = 'BleSensorAdapter not implemented (Phase 5 / waiting for HR sensor hardware)';

export class BleSensorAdapter implements SensorAdapter {
  async requestPermissions(): Promise<boolean> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async startScan(_listener: ScanListener): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async stopScan(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async connect(_sensorId: string): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async disconnect(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  onReading(_listener: ReadingListener): () => void {
    return () => {};
  }

  onConnectionChange(_listener: ConnectionListener): () => void {
    return () => {};
  }

  status(): ConnectionStatus {
    return 'disconnected';
  }

  connectedSensorId(): string | null {
    return null;
  }
}

/**
 * Helper для парсинга характеристики Heart Rate Measurement (GATT 0x2A37).
 * Возвращает null если данные невалидны.
 *
 * Это pure function, тестируется без реального BLE.
 *
 * Спецификация:
 *   https://www.bluetooth.com/specifications/specs/heart-rate-service-1-0/
 *   byte[0] = flags:
 *     bit 0: HR value format (0 = uint8, 1 = uint16)
 *     bit 1-2: sensor contact status
 *     bit 3: energy expended present
 *     bit 4: RR intervals present
 *   byte[1..] = HR value (1 или 2 байта в LE)
 */
export function parseHeartRateMeasurement(data: Uint8Array): number | null {
  if (data.length < 2) return null;
  const flags = data[0];
  const isUint16 = (flags & 0x01) === 0x01;
  if (isUint16) {
    if (data.length < 3) return null;
    return data[1] | (data[2] << 8);
  }
  return data[1];
}
