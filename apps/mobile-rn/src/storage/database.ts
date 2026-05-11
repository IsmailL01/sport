import * as SQLite from 'expo-sqlite';

const DB_NAME = 'running_ecosystem.db';
const TARGET_VERSION = 13;

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
 * - v7: + колонка `calories_kcal` в sessions (MET-based estimate на finalize).
 * - v8: + таблицы `social_users` (cache profiles) и `chats` (Phase 8 / A5).
 * - v9: + таблица `messages` с outbox-полями (Phase 8 / A5).
 * - v10: + media_id + media_mime в messages (Phase 8 / B3 image attachments).
 * - v11: + таблицы `stories` + `story_views` (Phase 8 / C — модуль `modules/stories`).
 * - v12: + таблицы `feed_posts` + `feed_comments` (Phase 8 / D — модуль `modules/feed`).
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

  if (current < 7) {
    const sessCols = db.getAllSync<{ name: string }>(
      `PRAGMA table_info(sessions);`,
    );
    if (!sessCols.some((c) => c.name === 'calories_kcal')) {
      db.execSync(`ALTER TABLE sessions ADD COLUMN calories_kcal REAL;`);
    }
    current = 7;
  }

  if (current < 8) {
    // social_users — кэш профилей других пользователей. Имя ≠ users чтобы
    // не путать с identity-таблицей на бэкенде.
    db.execSync(`
      CREATE TABLE IF NOT EXISTS social_users (
        id TEXT PRIMARY KEY,
        display_name TEXT,
        username TEXT,
        avatar_url TEXT,
        bio TEXT,
        is_blocked INTEGER NOT NULL DEFAULT 0,
        followers_count INTEGER NOT NULL DEFAULT 0,
        following_count INTEGER NOT NULL DEFAULT 0,
        cached_at INTEGER NOT NULL
      );
    `);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_social_users_username ON social_users (username);`);

    db.execSync(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        title TEXT,
        avatar_url TEXT,
        my_role TEXT NOT NULL DEFAULT 'member',
        members_count INTEGER NOT NULL DEFAULT 0,
        peer_user_id TEXT,                    -- для DM: id собеседника (cache)
        last_message_id TEXT,
        last_message_text TEXT,
        last_message_sender_id TEXT,
        last_message_ts INTEGER,
        last_read_message_id TEXT,
        unread_count INTEGER NOT NULL DEFAULT 0,
        muted INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        synced_at INTEGER,
        server_id TEXT
      );
    `);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_chats_last_msg_ts ON chats (last_message_ts DESC);`);
    current = 8;
  }

  if (current < 9) {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL UNIQUE,
        chat_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        text TEXT,
        media_local_uri TEXT,
        media_remote_url TEXT,
        media_width INTEGER,
        media_height INTEGER,
        media_duration_s REAL,
        reply_to_message_id TEXT,
        status TEXT NOT NULL DEFAULT 'sent',  -- pending | sent | delivered | read | failed
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_by TEXT,
        reactions_json TEXT,
        created_at INTEGER NOT NULL,
        edited_at INTEGER,
        synced_at INTEGER,
        updated_at INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0
      );
    `);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages (chat_id, created_at DESC);`);
    db.execSync(`CREATE INDEX IF NOT EXISTS idx_messages_pending ON messages (status, created_at) WHERE status IN ('pending','failed');`);

    // sync_cursors — для GET delta queries (per-chat, per-feed).
    db.execSync(`
      CREATE TABLE IF NOT EXISTS sync_cursors (
        key TEXT PRIMARY KEY,
        cursor TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    current = 9;
  }

  if (current < 10) {
    const cols = db.getAllSync<{ name: string }>(`PRAGMA table_info(messages);`);
    if (!cols.some((c) => c.name === 'media_id')) {
      db.execSync(`ALTER TABLE messages ADD COLUMN media_id TEXT;`);
    }
    if (!cols.some((c) => c.name === 'media_mime')) {
      db.execSync(`ALTER TABLE messages ADD COLUMN media_mime TEXT;`);
    }
    current = 10;
  }

  if (current < 11) {
    // Phase 8 / C: stories. Кэш активных stories + локальные drafts (offline-first).
    db.execSync(`
      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL,
        media_id TEXT NOT NULL,
        overlay_text TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        view_count INTEGER NOT NULL DEFAULT 0,
        i_viewed INTEGER NOT NULL DEFAULT 0,
        is_draft INTEGER NOT NULL DEFAULT 0,
        client_id TEXT,
        local_uri TEXT,
        mime TEXT,
        width INTEGER,
        height INTEGER,
        status TEXT,
        attempts INTEGER DEFAULT 0,
        last_error TEXT
      );
    `);
    db.execSync(
      `CREATE INDEX IF NOT EXISTS idx_stories_author_expires ON stories (author_id, expires_at);`,
    );
    db.execSync(
      `CREATE INDEX IF NOT EXISTS idx_stories_drafts ON stories (status, created_at) WHERE is_draft = 1;`,
    );
    db.execSync(`
      CREATE TABLE IF NOT EXISTS story_views (
        story_id TEXT NOT NULL,
        viewer_id TEXT NOT NULL,
        viewed_at INTEGER NOT NULL,
        PRIMARY KEY (story_id, viewer_id)
      );
    `);
    current = 11;
  }

  if (current < 12) {
    // Phase 8 / D: лента — posts + comments. Кэш + локальные drafts.
    // Имя feed_posts (не posts) чтобы не пересекалось с reserved-словом.
    db.execSync(`
      CREATE TABLE IF NOT EXISTS feed_posts (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL,
        kind TEXT NOT NULL,                 -- text | photo | session
        body TEXT,
        media_id TEXT,
        media_local_uri TEXT,
        media_mime TEXT,
        media_width INTEGER,
        media_height INTEGER,
        session_ref TEXT,
        like_count INTEGER NOT NULL DEFAULT 0,
        comment_count INTEGER NOT NULL DEFAULT 0,
        i_liked INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        edited_at INTEGER,
        is_draft INTEGER NOT NULL DEFAULT 0,
        client_id TEXT,
        status TEXT,
        attempts INTEGER DEFAULT 0,
        last_error TEXT
      );
    `);
    db.execSync(
      `CREATE INDEX IF NOT EXISTS idx_feed_posts_created ON feed_posts (created_at DESC);`,
    );
    db.execSync(
      `CREATE INDEX IF NOT EXISTS idx_feed_posts_drafts ON feed_posts (status, created_at) WHERE is_draft = 1;`,
    );
    db.execSync(`
      CREATE TABLE IF NOT EXISTS feed_comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    db.execSync(
      `CREATE INDEX IF NOT EXISTS idx_feed_comments_post ON feed_comments (post_id, created_at DESC);`,
    );
    current = 12;
  }

  if (current < 13) {
    // Phase 8 / M9.8: SQLite cache для социальных relations (used by
    // ForeignProfileScreen). Позволяет render instantly из cache,
    // потом refresh в background. TTL контролируется application
    // logic'ом (5 мин — see relationsRepository).
    db.execSync(`
      CREATE TABLE IF NOT EXISTS social_relations (
        viewer_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        is_following INTEGER NOT NULL DEFAULT 0,
        is_follower INTEGER NOT NULL DEFAULT 0,
        is_blocked INTEGER NOT NULL DEFAULT 0,
        is_blocked_by INTEGER NOT NULL DEFAULT 0,
        can_dm INTEGER NOT NULL DEFAULT 1,
        cached_at INTEGER NOT NULL,
        PRIMARY KEY (viewer_id, target_id)
      );
    `);
    db.execSync(
      `CREATE INDEX IF NOT EXISTS idx_social_relations_cached_at ON social_relations (cached_at);`,
    );
    current = 13;
  }

  if (current !== TARGET_VERSION) {
    throw new Error(
      `[storage] migration ended at version ${current}, expected ${TARGET_VERSION}`,
    );
  }
  db.execSync(`PRAGMA user_version = ${TARGET_VERSION};`);
}
