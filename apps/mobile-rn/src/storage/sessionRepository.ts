import type { ActivityType, Session } from '../domain/types';
import { getDatabase } from './database';

type SessionRow = {
  id: number;
  started_at: number;
  ended_at: number | null;
  is_closed: number | null;
  distance_m: number | null;
  area_m2: number | null;
  calc_method: string | null;
  note: string | null;
  avg_hr_bpm: number | null;
  max_hr_bpm: number | null;
  calories_kcal: number | null;
  activity_type: string | null;
};

const SELECT_COLS =
  'id, started_at, ended_at, is_closed, distance_m, area_m2, calc_method, note, avg_hr_bpm, max_hr_bpm, calories_kcal, activity_type';

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    isClosed: row.is_closed === null ? null : row.is_closed === 1,
    distanceM: row.distance_m,
    areaM2: row.area_m2,
    calcMethod: (row.calc_method ?? null) as Session['calcMethod'],
    note: row.note,
    avgHrBpm: row.avg_hr_bpm,
    maxHrBpm: row.max_hr_bpm,
    caloriesKcal: row.calories_kcal,
    activityType: (row.activity_type as ActivityType | null) ?? 'run',
  };
}

/**
 * Создать запись сессии в момент Start. id = startedAt (Unix epoch ms),
 * совпадает с session_id в таблице points.
 */
export function createSession(session: {
  id: number;
  startedAt: number;
  activityType?: ActivityType;
}): void {
  const db = getDatabase();
  db.runSync(
    `INSERT OR REPLACE INTO sessions (id, started_at, activity_type)
     VALUES (?, ?, ?);`,
    [session.id, session.startedAt, session.activityType ?? 'run'],
  );
}

/**
 * Финализировать сессию при Stop: записать ended_at + итоговые метрики.
 */
export function finalizeSession(
  id: number,
  finals: {
    endedAt: number;
    isClosed: boolean | null;
    distanceM: number | null;
    areaM2: number | null;
    calcMethod: Session['calcMethod'];
    avgHrBpm?: number | null;
    maxHrBpm?: number | null;
    caloriesKcal?: number | null;
  },
): void {
  const db = getDatabase();
  db.runSync(
    `UPDATE sessions
     SET ended_at = ?, is_closed = ?, distance_m = ?, area_m2 = ?, calc_method = ?,
         avg_hr_bpm = ?, max_hr_bpm = ?, calories_kcal = ?
     WHERE id = ?;`,
    [
      finals.endedAt,
      finals.isClosed === null ? null : finals.isClosed ? 1 : 0,
      finals.distanceM,
      finals.areaM2,
      finals.calcMethod,
      finals.avgHrBpm ?? null,
      finals.maxHrBpm ?? null,
      finals.caloriesKcal ?? null,
      id,
    ],
  );
}

export function setSessionNote(id: number, note: string | null): void {
  const db = getDatabase();
  db.runSync(`UPDATE sessions SET note = ? WHERE id = ?;`, [note, id]);
}

export function getSession(id: number): Session | null {
  const db = getDatabase();
  const row = db.getFirstSync<SessionRow>(
    `SELECT ${SELECT_COLS}
     FROM sessions WHERE id = ?;`,
    [id],
  );
  return row ? rowToSession(row) : null;
}

export function listSessions(limit = 100): Session[] {
  const db = getDatabase();
  const rows = db.getAllSync<SessionRow>(
    `SELECT ${SELECT_COLS}
     FROM sessions ORDER BY started_at DESC LIMIT ?;`,
    [limit],
  );
  return rows.map(rowToSession);
}

/**
 * Найти последнюю незавершённую сессию (для crash recovery, см. ТЗ §4.5).
 */
export function findActiveSession(): Session | null {
  const db = getDatabase();
  const row = db.getFirstSync<SessionRow>(
    `SELECT ${SELECT_COLS}
     FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1;`,
  );
  return row ? rowToSession(row) : null;
}

export function deleteSession(id: number): void {
  const db = getDatabase();
  // Удаляем точки и сам session-row атомарно.
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM points WHERE session_id = ?;`, [id]);
    db.runSync(`DELETE FROM sessions WHERE id = ?;`, [id]);
  });
}

/**
 * Создать manual session — пользователь записывает вручную (без GPS).
 * Phase 6.5 / extra. Без точек, без замыкания, без area.
 */
export function createManualSession(input: {
  startedAt: number;
  endedAt: number;
  distanceM: number;
  avgHrBpm: number | null;
  note: string | null;
}): number {
  const db = getDatabase();
  const id = input.startedAt;
  db.runSync(
    `INSERT OR REPLACE INTO sessions
     (id, started_at, ended_at, is_closed, distance_m, area_m2, calc_method, note,
      avg_hr_bpm, max_hr_bpm, calories_kcal)
     VALUES (?, ?, ?, 0, ?, NULL, NULL, ?, ?, ?, NULL);`,
    [
      id,
      input.startedAt,
      input.endedAt,
      input.distanceM,
      input.note,
      input.avgHrBpm,
      input.avgHrBpm,
    ],
  );
  return id;
}
