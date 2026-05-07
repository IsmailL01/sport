// Sensor abstraction layer. Изолирует BLE / нативный Bluetooth от остального
// кода — также как LocationAdapter изолирует expo-location.
// ТЗ §3.3 (sensor-agnostic), §7.

export type SensorType = 'hr' | 'cadence' | 'power' | 'temperature';

/** Найденное BLE-устройство при сканировании. */
export type DiscoveredSensor = {
  id: string;          // platform-specific UUID
  name: string;
  /** RSSI в dBm; -50 — отлично, -90 — на грани. */
  rssi: number | null;
  /** Какие сервисы поддерживает (известные UUIDs). */
  services: SensorType[];
};

/** Текущее состояние подключения. */
export type ConnectionStatus =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'error';

/** Одно измерение от сенсора. */
export type SensorReading = {
  /** Unix epoch ms — момент получения. */
  timestamp: number;
  type: SensorType;
  value: number;
  /** Идентификатор устройства-источника (для multi-sensor сценариев). */
  sourceId: string;
};

export type ScanListener = (sensors: DiscoveredSensor[]) => void;
export type ReadingListener = (reading: SensorReading) => void;
export type ConnectionListener = (status: ConnectionStatus, error?: string) => void;

/**
 * Контракт сенсорного адаптера. Все методы async — потому что BLE операции
 * inherently асинхронные.
 *
 * Сейчас реализации:
 *   - MockSensorAdapter — генерирует realistic HR для dev/тестов
 *   - BleSensorAdapter   — skeleton (требует react-native-ble-plx + Phase 5
 *                          dev build с native модулем)
 */
export interface SensorAdapter {
  /** Запросить runtime permission на Bluetooth (Android 12+ / iOS). */
  requestPermissions(): Promise<boolean>;

  /** Запустить сканирование. Listener дёргается каждый раз когда найден новый сенсор. */
  startScan(listener: ScanListener): Promise<void>;
  stopScan(): Promise<void>;

  /** Подключиться к конкретному сенсору. */
  connect(sensorId: string): Promise<void>;
  disconnect(): Promise<void>;

  /** Подписаться на новые HR-readings. */
  onReading(listener: ReadingListener): () => void;
  /** Подписаться на изменения connection state. */
  onConnectionChange(listener: ConnectionListener): () => void;

  /** Текущий статус (для UI инициализации). */
  status(): ConnectionStatus;
  connectedSensorId(): string | null;
}
