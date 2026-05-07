// Mock-реализация SensorAdapter для dev/test без реального BLE-устройства.
// Симулирует:
//   - найденные устройства появляются с задержкой ~500мс / 1500мс
//   - после connect — генерация HR readings раз в секунду по реалистичной кривой:
//     базовый ритм ~120-160 уд/мин с лёгкими колебаниями + drift вверх как в
//     длинной пробежке.

import type {
  ConnectionListener,
  ConnectionStatus,
  DiscoveredSensor,
  ReadingListener,
  ScanListener,
  SensorAdapter,
  SensorReading,
} from '../SensorAdapter';

const MOCK_SENSORS: DiscoveredSensor[] = [
  { id: 'mock-polar-h10', name: 'Polar H10 (mock)', rssi: -55, services: ['hr'] },
  { id: 'mock-garmin-hrm', name: 'Garmin HRM-Dual (mock)', rssi: -68, services: ['hr'] },
];

export class MockSensorAdapter implements SensorAdapter {
  private _status: ConnectionStatus = 'disconnected';
  private _connectedId: string | null = null;
  private scanTimers: ReturnType<typeof setTimeout>[] = [];
  private readingTimer: ReturnType<typeof setInterval> | null = null;
  private readingListeners = new Set<ReadingListener>();
  private connectionListeners = new Set<ConnectionListener>();
  private startedAt = 0;

  async requestPermissions(): Promise<boolean> {
    return true;
  }

  async startScan(listener: ScanListener): Promise<void> {
    this.setStatus('scanning');
    this.scanTimers.forEach(clearTimeout);
    this.scanTimers = [];
    const found: DiscoveredSensor[] = [];
    MOCK_SENSORS.forEach((s, i) => {
      const t = setTimeout(() => {
        found.push(s);
        listener([...found]);
      }, 500 + i * 1000);
      this.scanTimers.push(t);
    });
  }

  async stopScan(): Promise<void> {
    this.scanTimers.forEach(clearTimeout);
    this.scanTimers = [];
    if (this._status === 'scanning') {
      this.setStatus('disconnected');
    }
  }

  async connect(sensorId: string): Promise<void> {
    await this.stopScan();
    this.setStatus('connecting');
    await new Promise((r) => setTimeout(r, 800));
    this._connectedId = sensorId;
    this.setStatus('connected');
    this.startedAt = Date.now();
    this.startGeneratingReadings();
  }

  async disconnect(): Promise<void> {
    if (this.readingTimer !== null) {
      clearInterval(this.readingTimer);
      this.readingTimer = null;
    }
    this._connectedId = null;
    this.setStatus('disconnected');
  }

  onReading(listener: ReadingListener): () => void {
    this.readingListeners.add(listener);
    return () => this.readingListeners.delete(listener);
  }

  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this._status); // immediate emit для синхронизации UI
    return () => this.connectionListeners.delete(listener);
  }

  status(): ConnectionStatus {
    return this._status;
  }

  connectedSensorId(): string | null {
    return this._connectedId;
  }

  private setStatus(status: ConnectionStatus, error?: string): void {
    this._status = status;
    this.connectionListeners.forEach((l) => l(status, error));
  }

  private startGeneratingReadings(): void {
    if (this.readingTimer !== null) clearInterval(this.readingTimer);
    this.readingTimer = setInterval(() => {
      if (this._status !== 'connected' || this._connectedId === null) return;
      const reading: SensorReading = {
        timestamp: Date.now(),
        type: 'hr',
        value: this.simulateHR(),
        sourceId: this._connectedId,
      };
      this.readingListeners.forEach((l) => l(reading));
    }, 1000);
  }

  private simulateHR(): number {
    // Симулируем кривую: 130 уд/мин в первую минуту, потом drift к 160.
    const elapsedMin = (Date.now() - this.startedAt) / 60_000;
    const target = 130 + Math.min(30, elapsedMin * 5);
    // ±3 уд/мин noise.
    const noise = (Math.random() - 0.5) * 6;
    return Math.round(target + noise);
  }
}
