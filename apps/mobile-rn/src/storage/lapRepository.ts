// SQLite repo для laps (см. database.ts v18).

import { getDatabase } from './database';
import type { Lap } from '../domain/lap';

type LapRow = {
  id: number;
  session_id: number;
  lap_number: number;
  started_at: number;
  ended_at: number;
  distance_m: number;
  duration_s: number;
  pace_min_km: number | null;
  avg_hr_bpm: number | null;
};

function rowToLap(r: LapRow): Lap {
  return {
    lapNumber: r.lap_number,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    distanceM: r.distance_m,
    durationS: r.duration_s,
    paceMinKm: r.pace_min_km,
    avgHrBpm: r.avg_hr_bpm,
  };
}

export function appendLapsForSession(sessionId: number, laps: readonly Lap[]): void {
  if (laps.length === 0) return;
  const db = getDatabase();
  db.withTransactionSync(() => {
    // Replace-on-conflict: при повторной записи (e.g. recovery) перетираем.
    db.runSync(`DELETE FROM laps WHERE session_id = ?;`, [sessionId]);
    for (const lap of laps) {
      db.runSync(
        `INSERT INTO laps
         (session_id, lap_number, started_at, ended_at, distance_m, duration_s, pace_min_km, avg_hr_bpm)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          sessionId,
          lap.lapNumber,
          lap.startedAt,
          lap.endedAt,
          lap.distanceM,
          lap.durationS,
          lap.paceMinKm,
          lap.avgHrBpm,
        ],
      );
    }
  });
}

export function listLapsForSession(sessionId: number): Lap[] {
  const db = getDatabase();
  const rows = db.getAllSync<LapRow>(
    `SELECT id, session_id, lap_number, started_at, ended_at, distance_m, duration_s, pace_min_km, avg_hr_bpm
     FROM laps WHERE session_id = ? ORDER BY lap_number ASC;`,
    [sessionId],
  );
  return rows.map(rowToLap);
}

export function deleteLapsForSession(sessionId: number): void {
  const db = getDatabase();
  db.runSync(`DELETE FROM laps WHERE session_id = ?;`, [sessionId]);
}
