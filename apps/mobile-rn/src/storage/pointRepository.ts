import type { RawPoint } from '../domain/types';
import { getDatabase } from './database';

type PointRow = {
  ts: number;
  lat: number;
  lon: number;
  alt: number | null;
  accuracy: number | null;
  speed: number | null;
};

export function appendPoints(sessionId: number, points: RawPoint[]): void {
  if (points.length === 0) return;
  const db = getDatabase();
  db.withTransactionSync(() => {
    const stmt = db.prepareSync(
      `INSERT INTO points (session_id, ts, lat, lon, alt, accuracy, speed)
       VALUES ($sid, $ts, $lat, $lon, $alt, $accuracy, $speed);`,
    );
    try {
      for (const p of points) {
        stmt.executeSync({
          $sid: sessionId,
          $ts: p.timestamp,
          $lat: p.latitude,
          $lon: p.longitude,
          $alt: p.altitude,
          $accuracy: p.accuracy,
          $speed: p.speed,
        });
      }
    } finally {
      stmt.finalizeSync();
    }
  });
}

export function loadPointsForSession(sessionId: number): RawPoint[] {
  const db = getDatabase();
  const rows = db.getAllSync<PointRow>(
    `SELECT ts, lat, lon, alt, accuracy, speed FROM points
     WHERE session_id = ? ORDER BY ts ASC;`,
    [sessionId],
  );
  return rows.map((row) => ({
    timestamp: row.ts,
    latitude: row.lat,
    longitude: row.lon,
    altitude: row.alt,
    accuracy: row.accuracy,
    speed: row.speed,
    heading: null,
  }));
}

export function getLastSessionId(): number | null {
  const db = getDatabase();
  const row = db.getFirstSync<{ session_id: number | null }>(
    `SELECT MAX(session_id) AS session_id FROM points;`,
  );
  return row?.session_id ?? null;
}

export function deleteSession(sessionId: number): void {
  const db = getDatabase();
  db.runSync(`DELETE FROM points WHERE session_id = ?;`, [sessionId]);
}
