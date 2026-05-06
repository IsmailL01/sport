import * as SQLite from 'expo-sqlite';

const DB_NAME = 'running_ecosystem.db';

let _db: SQLite.SQLiteDatabase | null = null;

/**
 * Singleton доступ к SQLite. Открывается лениво, схема инициализируется один раз.
 * Для прототипа Phase 0 — таблица points (минимум для P0-B-07 acceptance).
 * В Phase 1 (P1-A-07) добавится таблица sessions с метаданными.
 */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (_db !== null) return _db;
  _db = SQLite.openDatabaseSync(DB_NAME);
  // WAL mode для меньшего риска потери данных при force-kill
  _db.execSync('PRAGMA journal_mode = WAL;');
  _db.execSync(`
    CREATE TABLE IF NOT EXISTS points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      ts INTEGER NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      alt REAL,
      accuracy REAL,
      speed REAL
    );
  `);
  _db.execSync(
    'CREATE INDEX IF NOT EXISTS idx_points_session_ts ON points (session_id, ts);',
  );
  return _db;
}
