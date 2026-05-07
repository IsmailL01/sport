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

/**
 * Аггрегировать HR-readings сессии: avg / max.
 * Возвращает null-ы если HR-данных нет.
 */
export function aggregateHrForSession(sessionId: number): {
  avgHrBpm: number | null;
  maxHrBpm: number | null;
  count: number;
} {
  const db = getDatabase();
  const row = db.getFirstSync<{ avg_hr: number | null; max_hr: number | null; cnt: number }>(
    `SELECT AVG(value) AS avg_hr, MAX(value) AS max_hr, COUNT(*) AS cnt
     FROM sensor_readings WHERE session_id = ? AND type = 'hr';`,
    [sessionId],
  );
  if (!row || row.cnt === 0) return { avgHrBpm: null, maxHrBpm: null, count: 0 };
  return {
    avgHrBpm: row.avg_hr === null ? null : Math.round(row.avg_hr),
    maxHrBpm: row.max_hr === null ? null : Math.round(row.max_hr),
    count: row.cnt,
  };
}
