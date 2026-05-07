import * as SQLite from 'expo-sqlite';

const DB_NAME = 'running_ecosystem.db';
const TARGET_VERSION = 6;

let _db: SQLite.SQLiteDatabase | null = null;

/**
 * Singleton доступ к SQLite. Открывается лениво, миграции прогоняются
 * при первом обращении на основе `PRAGMA user_version`.
 *
 * - v1: только таблица `points` (Phase 0 / P0-B-07).
 * - v2: + таблица `sessions` с метаданными (Phase 1 / P1-A-07, ТЗ §4.5).
 * - v3: + колонка `source` в points (raw/kalman/interpolated) для трассировки pipeline.
 * - v4: + колонки `synced_at` и `server_id` в sessions для outbox-sync (Phase 2 / P2-B-04).
 * - v5: + таблица `sensor_readings` для HR/cadence/power (Phase 5 / P5-A-04).
 * - v6: + колонки `avg_hr_bpm` и `max_hr_bpm` в sessions (агрегация HR на finalize).
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

  if (current < 4) {
    const sessCols = db.getAllSync<{ name: string }>(
      `PRAGMA table_info(sessions);`,
    );
    if (!sessCols.some((c) => c.name === 'synced_at')) {
      db.execSync(`ALTER TABLE sessions ADD COLUMN synced_at INTEGER;`);
    }
    if (!sessCols.some((c) => c.name === 'server_id')) {
      db.execSync(`ALTER TABLE sessions ADD COLUMN server_id TEXT;`);
    }
    if (!sessCols.some((c) => c.name === 'updated_at')) {
      db.execSync(`ALTER TABLE sessions ADD COLUMN updated_at INTEGER;`);
    }
    db.execSync(
      `CREATE INDEX IF NOT EXISTS idx_sessions_pending_sync ON sessions (synced_at);`,
    );
    current = 4;
  }

  if (current < 5) {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS sensor_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        type TEXT NOT NULL,           -- hr | cadence | power | temperature
        value REAL NOT NULL,
        source_id TEXT
      );
    `);
    db.execSync(
      `CREATE INDEX IF NOT EXISTS idx_sensor_readings_session_ts ON sensor_readings (session_id, ts);`,
    );
    current = 5;
  }

  if (current < 6) {
    const sessCols = db.getAllSync<{ name: string }>(
      `PRAGMA table_info(sessions);`,
    );
    if (!sessCols.some((c) => c.name === 'avg_hr_bpm')) {
      db.execSync(`ALTER TABLE sessions ADD COLUMN avg_hr_bpm REAL;`);
    }
    if (!sessCols.some((c) => c.name === 'max_hr_bpm')) {
      db.execSync(`ALTER TABLE sessions ADD COLUMN max_hr_bpm REAL;`);
    }
    current = 6;
  }

  if (current !== TARGET_VERSION) {
    throw new Error(
      `[storage] migration ended at version ${current}, expected ${TARGET_VERSION}`,
    );
  }
  db.execSync(`PRAGMA user_version = ${TARGET_VERSION};`);
}
