import type { Point, RawPoint } from '../domain/types';
import { getDatabase } from './database';

type PointRow = {
  ts: number;
  lat: number;
  lon: number;
  alt: number | null;
  accuracy: number | null;
  speed: number | null;
  source: string | null;
};

export function appendPoints(sessionId: number, points: Point[]): void {
  if (points.length === 0) return;
  const db = getDatabase();
  db.withTransactionSync(() => {
    const stmt = db.prepareSync(
      `INSERT INTO points (session_id, ts, lat, lon, alt, accuracy, speed, source)
       VALUES ($sid, $ts, $lat, $lon, $alt, $accuracy, $speed, $source);`,
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
          $source: p.source,
        });
      }
    } finally {
      stmt.finalizeSync();
    }
  });
}

export function loadPointsForSession(sessionId: number): Point[] {
  const db = getDatabase();
  const rows = db.getAllSync<PointRow>(
    `SELECT ts, lat, lon, alt, accuracy, speed, source FROM points
     WHERE session_id = ? ORDER BY ts ASC;`,
    [sessionId],
  );
  return rows.map((row) => rowToPoint(row));
}

function rowToPoint(row: PointRow): Point {
  const source = (row.source ?? 'raw') as Point['source'];
  return {
    timestamp: row.ts,
    latitude: row.lat,
    longitude: row.lon,
    altitude: row.alt,
    accuracy: row.accuracy,
    speed: row.speed,
    heading: null,
    source,
  };
}

/**
 * Удалить точки сессии (без удаления самой записи в `sessions` —
 * для атомарного удаления используйте sessionRepository.deleteSession).
 */
export function deletePointsForSession(sessionId: number): void {
  const db = getDatabase();
  db.runSync(`DELETE FROM points WHERE session_id = ?;`, [sessionId]);
}

// Алиасы для backward compat — RawPoint можно записать как 'raw'.
export function appendRawPoints(sessionId: number, points: RawPoint[]): void {
  appendPoints(
    sessionId,
    points.map((p) => ({ ...p, source: 'raw' as const })),
  );
}
