import type { SensorReading, SensorType } from '../sensors/SensorAdapter';
import { getDatabase } from './database';

type SensorRow = {
  ts: number;
  type: string;
  value: number;
  source_id: string | null;
};

export function appendSensorReadings(
  sessionId: number,
  readings: readonly SensorReading[],
): void {
  if (readings.length === 0) return;
  const db = getDatabase();
  db.withTransactionSync(() => {
    const stmt = db.prepareSync(
      `INSERT INTO sensor_readings (session_id, ts, type, value, source_id)
       VALUES ($sid, $ts, $type, $value, $source);`,
    );
    try {
      for (const r of readings) {
        stmt.executeSync({
          $sid: sessionId,
          $ts: r.timestamp,
          $type: r.type,
          $value: r.value,
          $source: r.sourceId,
        });
      }
    } finally {
      stmt.finalizeSync();
    }
  });
}

export function loadSensorReadingsForSession(
  sessionId: number,
  type?: SensorType,
): SensorReading[] {
  const db = getDatabase();
  const where = type
    ? `WHERE session_id = ? AND type = ? ORDER BY ts ASC`
    : `WHERE session_id = ? ORDER BY ts ASC`;
  const args = type ? [sessionId, type] : [sessionId];
  const rows = db.getAllSync<SensorRow>(
    `SELECT ts, type, value, source_id FROM sensor_readings ${where};`,
    args,
  );
  return rows.map((r) => ({
    timestamp: r.ts,
    type: r.type as SensorType,
    value: r.value,
    sourceId: r.source_id ?? '',
  }));
}

export function deleteSensorReadingsForSession(sessionId: number): void {
  const db = getDatabase();
  db.runSync(`DELETE FROM sensor_readings WHERE session_id = ?;`, [sessionId]);
}
