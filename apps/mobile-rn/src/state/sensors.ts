// Состояние сенсорной подсистемы: подключённое устройство, live HR.
// Сами readings во время recording идут в SQLite + ассоциируются с точками
// (см. associateHrToPoints в domain/sensorAssociation.ts).

import { create } from 'zustand';

import { sensorAdapter } from '../sensors';
import type {
  ConnectionStatus,
  DiscoveredSensor,
  SensorReading,
} from '../sensors/SensorAdapter';
import { appendSensorReadings } from '../storage/sensorRepository';
import { useActivityStore } from './activity';

const HR_BUFFER_THRESHOLD = 30; // flush в БД раз в 30 readings (~30 сек)

type SensorsStore = {
  status: ConnectionStatus;
  connectedSensorId: string | null;
  connectedSensorName: string | null;
  discovered: DiscoveredSensor[];
  /** Текущий live HR (последнее измерение). */
  liveHrBpm: number | null;
  /** Все HR readings во время текущей recording-сессии. Сбрасывается на start(). */
  sessionReadings: SensorReading[];

  hydrate: () => void;
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  connect: (sensorId: string, sensorName: string) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Сбросить readings (вызывается activity.start). */
  clearSessionReadings: () => void;
};

let buffer: SensorReading[] = [];
let unsubReading: (() => void) | null = null;
let unsubConnection: (() => void) | null = null;

function flushBuffer(): void {
  const sessionId = useActivityStore.getState().sessionId;
  if (sessionId === null || buffer.length === 0) return;
  try {
    appendSensorReadings(sessionId, buffer);
    buffer = [];
  } catch (e) {
    console.error('[sensors] flush failed', e);
  }
}

export const useSensorsStore = create<SensorsStore>((set, get) => ({
  status: 'disconnected',
  connectedSensorId: null,
  connectedSensorName: null,
  discovered: [],
  liveHrBpm: null,
  sessionReadings: [],

  hydrate: () => {
    if (unsubReading !== null) unsubReading();
    if (unsubConnection !== null) unsubConnection();

    unsubConnection = sensorAdapter.onConnectionChange((status, error) => {
      set({ status });
      if (status === 'disconnected') {
        set({ connectedSensorId: null, connectedSensorName: null, liveHrBpm: null });
      }
      if (error && __DEV__) console.warn('[sensors] connection error:', error);
    });

    unsubReading = sensorAdapter.onReading((reading) => {
      if (reading.type !== 'hr') return;
      set({ liveHrBpm: reading.value });
      // Если идёт recording — добавляем в буфер для flush в БД.
      if (useActivityStore.getState().state === 'recording') {
        set((s) => ({ sessionReadings: [...s.sessionReadings, reading] }));
        buffer.push(reading);
        if (buffer.length >= HR_BUFFER_THRESHOLD) flushBuffer();
      }
    });
  },

  startScan: async () => {
    const ok = await sensorAdapter.requestPermissions();
    if (!ok) return;
    set({ discovered: [] });
    await sensorAdapter.startScan((found) => set({ discovered: found }));
  },

  stopScan: async () => {
    await sensorAdapter.stopScan();
  },

  connect: async (sensorId, sensorName) => {
    try {
      await sensorAdapter.connect(sensorId);
      set({ connectedSensorId: sensorId, connectedSensorName: sensorName });
    } catch (e) {
      console.error('[sensors] connect failed', e);
    }
  },

  disconnect: async () => {
    flushBuffer();
    await sensorAdapter.disconnect();
    set({
      connectedSensorId: null,
      connectedSensorName: null,
      liveHrBpm: null,
    });
  },

  clearSessionReadings: () => {
    flushBuffer(); // что осталось — сохраняем в БД предыдущей сессии
    buffer = [];
    set({ sessionReadings: [] });
  },
}));
