import * as SQLite from 'expo-sqlite';

const DB_NAME = 'running_ecosystem.db';
const TARGET_VERSION = 3;

let _db: SQLite.SQLiteDatabase | null = null;

/**
 * Singleton доступ к SQLite. Открывается лениво, миграции прогоняются
 * при первом обращении на основе `PRAGMA user_version`.
 *
 * - v1: только таблица `points` (Phase 0 / P0-B-07).
 * - v2: + таблица `sessions` с метаданными (Phase 1 / P1-A-07, ТЗ §4.5).
 * - v3: + колонка `source` в points (raw/kalman/interpolated) для трассировки pipeline.
 */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (_db !== null) return _db;
  const db = SQLite.openDatabaseSync(DB_NAME);
  db.execSync('PRAGMA journal_mode = WAL;');
  runMigrations(db);
  _db = db;
  return db;
}

function runMigrations(db: SQLite.SQLiteDatabase): void {
  const row = db.getFirstSync<{ user_version: number }>(
    'PRAGMA user_version;',
  );
  let current = row?.user_version ?? 0;

  if (current < 1) {
    db.execSync(`
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
    db.execSync(
      'CREATE INDEX IF NOT EXISTS idx_points_session_ts ON points (session_id, ts);',
    );
    current = 1;
  }

  if (current < 2) {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        is_closed INTEGER,
        distance_m REAL,
        area_m2 REAL,
        calc_method TEXT,
        note TEXT
      );
    `);
    db.execSync(
      'CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions (started_at DESC);',
    );
    current = 2;
  }

  if (current < 3) {
    // ALTER TABLE ... ADD COLUMN не поддерживает IF NOT EXISTS — проверяем вручную.
    const cols = db.getAllSync<{ name: string }>(
      `PRAGMA table_info(points);`,
    );
    if (!cols.some((c) => c.name === 'source')) {
      db.execSync(`ALTER TABLE points ADD COLUMN source TEXT;`);
    }
    current = 3;
  }

  if (current !== TARGET_VERSION) {
    throw new Error(
      `[storage] migration ended at version ${current}, expected ${TARGET_VERSION}`,
    );
  }
  db.execSync(`PRAGMA user_version = ${TARGET_VERSION};`);
}
