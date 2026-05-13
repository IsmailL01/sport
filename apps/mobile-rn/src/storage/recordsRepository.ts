// SQLite repository для personal_records. Phase 8 / M10.1.

import { getDatabase } from './database';
import type { PersonalRecord, RecordKind } from '../domain/records';

type Row = {
  kind: string;
  value: number;
  session_id: number;
  achieved_at: number;
  prev_value: number | null;
};

function rowToRecord(r: Row): PersonalRecord {
  return {
    kind: r.kind as RecordKind,
    value: r.value,
    sessionId: r.session_id,
    achievedAt: r.achieved_at,
    prevValue: r.prev_value,
  };
}

/** Получить все текущие рекорды (по одному per kind). */
export function listAllRecords(): PersonalRecord[] {
  const db = getDatabase();
  const rows = db.getAllSync<Row>(
    `SELECT kind, value, session_id, achieved_at, prev_value
     FROM personal_records ORDER BY achieved_at DESC`,
  );
  return rows.map(rowToRecord);
}

/** Возвращает map kind → value для быстрой передачи в domain/records.detectNewRecords. */
export function getCurrentValuesByKind(): Partial<Record<RecordKind, number>> {
  const db = getDatabase();
  const rows = db.getAllSync<Row>(
    `SELECT kind, value, session_id, achieved_at, prev_value FROM personal_records`,
  );
  const out: Partial<Record<RecordKind, number>> = {};
  for (const r of rows) {
    out[r.kind as RecordKind] = r.value;
  }
  return out;
}

/**
 * Upsert new record. Перезаписывает row если он есть, ставит prev_value
 * в старое значение. INSERT если row не было.
 */
export function upsertRecord(rec: PersonalRecord): void {
  const db = getDatabase();
  db.runSync(
    `INSERT INTO personal_records (kind, value, session_id, achieved_at, prev_value)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(kind) DO UPDATE SET
       value = excluded.value,
       session_id = excluded.session_id,
       achieved_at = excluded.achieved_at,
       prev_value = excluded.prev_value`,
    [rec.kind, rec.value, rec.sessionId, rec.achievedAt, rec.prevValue],
  );
}

/** Очистить все рекорды (logout / debug). */
export function clearAllRecords(): void {
  const db = getDatabase();
  db.runSync(`DELETE FROM personal_records`);
}
