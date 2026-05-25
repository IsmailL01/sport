import * as SQLite from 'expo-sqlite';

const DB_NAME = 'running_ecosystem.db';
const TARGET_VERSION = 20;

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
 * - v11: + таблицы `stories` + `story_views` (deprecated: feed/stories убраны из UI;
 *   таблицы остаются для rollback-safety, не используются на чтение/запись).
 * - v12: + таблицы `feed_posts` + `feed_comments` (deprecated: см. v11).
 * - v13: + таблица `social_relations` (cache для ForeignProfile).
 * - v14: + таблица `personal_records` (best-of каждого RecordKind).
 * - v15: + таблицы `wallet_balance` + `wallet_transactions` (внутренняя валюта,
 *   калории → монеты, см. docs/CURRENCY.md).
 * - v16: + колонки `source` и `external_uuid` в sessions (импорт активностей
 *   из часов/HealthKit/Health Connect; дедуп по (source, external_uuid)).
 * - v17: + колонка `activity_type` в sessions (run / trail / walk / cycle /
 *   treadmill / generic_cardio). Маршрутизирует MET-таблицу и multiplier
 *   валюты (см. domain/calories.ts и domain/currency.ts).
 * - v18: + таблица `laps` (manual lap-marks во время записи). Per-session
 *   с lap_number, distance, duration, pace, avg_hr.
 * - v19: CHECK (coins >= 0) на wallet_balance. SQLite не поддерживает
 *   ADD CONSTRAINT на ALTER TABLE — пересоздаём таблицу с миграцией данных.
 */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (_db !== null) return _db;
  const db = SQLite.openDatabaseSync(DB_NAME);
  db.execSync('PRAGMA journal_mode = WAL;');
  runMigrationsOn(db);
  _db = db;
  return db;
}

/**
 * Полный сброс локальной SQLite-базы: закрыть singleton, удалить файл,
 * на следующем `getDatabase()` БД будет переоткрыта пустой и миграции
 * прокатятся заново. Используется в delete-account flow
 * (settings → «Удалить аккаунт»).
 *
 * Безопасно вызывать когда _db === null (no-op закрытие).
 */
export async function wipeDatabase(): Promise<void> {
  if (_db !== null) {
    try {
      await _db.closeAsync();
    } catch (e) {
      console.warn('[storage] closeAsync failed during wipe', e);
    }
    _db = null;
  }
  try {
    await SQLite.deleteDatabaseAsync(DB_NAME);
  } catch (e) {
    // Если файла нет — это OK, ничего удалять не нужно.
    console.warn('[storage] deleteDatabaseAsync failed (ok if file missing)', e);
  }
}

/**
 * Test-only hook: подменить module-level singleton БД. Используется в
 * `src/__tests__/sessionRepository.integration.test.ts` для подачи `:memory:`
 * экземпляра, заполняемого через `runMigrations()` в `beforeEach`. PHASE1-07.
 *
 * Под Jest preset jest-expo `__DEV__` обычно true, но мы не блокируем хук
 * жёстко через assert — потеря защиты допустима, потому что функция не
 * экспортирована в публичный API через `index.ts` (его нет в storage/), а
 * прямой импорт `_setDatabase` из неструктурированного места легко
 * детектируется ревьюером.
 */
export function _setDatabase(db: SQLite.SQLiteDatabase | null): void {
  _db = db;
}

/**
 * Прогнать все миграции до TARGET_VERSION на переданной БД. Под Jest
 * вызывается с in-memory экземпляром после `_setDatabase`. Под runtime —
 * `getDatabase()` использует её на свежей файловой БД лениво.
 */
export function runMigrations(): void {
  const db = getDatabase();
  runMigrationsOn(db);
}

function runMigrationsOn(db: SQLite.SQLiteDatabase): void {
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

  if (current < 14) {
    // Phase 8 / M10.1: личные рекорды.
    // По одной строке на каждый kind (UNIQUE) — храним только текущий
    // best. Историю рекордов восстанавливаем из сессий при необходимости.
    db.execSync(`
      CREATE TABLE IF NOT EXISTS personal_records (
        kind TEXT PRIMARY KEY,            -- longest_distance / longest_duration / best_pace_1km / ...
        value REAL NOT NULL,              -- meters / seconds / minPerKm / kcal / kmh
        session_id INTEGER NOT NULL,
        achieved_at INTEGER NOT NULL,
        prev_value REAL                   -- previous best, для UI дельты
      );
    `);
    db.execSync(
      `CREATE INDEX IF NOT EXISTS idx_personal_records_session ON personal_records(session_id);`,
    );
    current = 14;
  }

  if (current < 15) {
    // Внутренняя валюта приложения. См. docs/CURRENCY.md.
    db.execSync(`
      CREATE TABLE IF NOT EXISTS wallet_balance (
        user_id TEXT PRIMARY KEY,
        coins INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
    `);
    db.execSync(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,                -- earn | spend | adjust
        amount INTEGER NOT NULL,           -- always positive; sign из kind
        source TEXT NOT NULL,              -- session | admin | refund | promo
        source_session_id INTEGER,         -- nullable; FK на sessions.id
        ts INTEGER NOT NULL,
        meta TEXT                          -- JSON: { activityType, kcal, paceMinKm, ... }
      );
    `);
    db.execSync(
      `CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_ts ON wallet_transactions (user_id, ts DESC);`,
    );
    db.execSync(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_session_unique
       ON wallet_transactions (user_id, source_session_id)
       WHERE source_session_id IS NOT NULL;`,
    );
    current = 15;
  }

  if (current < 16) {
    // Integrations: помечаем источник сессии и внешний uuid для дедупа.
    const sessCols = db.getAllSync<{ name: string }>(
      `PRAGMA table_info(sessions);`,
    );
    if (!sessCols.some((c) => c.name === 'source')) {
      db.execSync(
        `ALTER TABLE sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'gps';`,
      );
    }
    if (!sessCols.some((c) => c.name === 'external_uuid')) {
      db.execSync(`ALTER TABLE sessions ADD COLUMN external_uuid TEXT;`);
    }
    // Дедуп: один внешний uuid + источник = одна сессия.
    db.execSync(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_source_external
       ON sessions (source, external_uuid)
       WHERE external_uuid IS NOT NULL;`,
    );
    current = 16;
  }

  if (current < 17) {
    const sessCols = db.getAllSync<{ name: string }>(
      `PRAGMA table_info(sessions);`,
    );
    if (!sessCols.some((c) => c.name === 'activity_type')) {
      db.execSync(
        `ALTER TABLE sessions ADD COLUMN activity_type TEXT NOT NULL DEFAULT 'run';`,
      );
    }
    current = 17;
  }

  if (current < 18) {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS laps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        lap_number INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER NOT NULL,
        distance_m REAL NOT NULL,
        duration_s INTEGER NOT NULL,
        pace_min_km REAL,
        avg_hr_bpm REAL
      );
    `);
    db.execSync(
      `CREATE INDEX IF NOT EXISTS idx_laps_session ON laps (session_id, lap_number);`,
    );
    current = 18;
  }

  if (current < 19) {
    // wallet_balance.coins должен быть >= 0. SQLite не позволяет добавить
    // CHECK через ALTER TABLE → пересоздаём таблицу.
    db.withTransactionSync(() => {
      db.execSync(`
        CREATE TABLE IF NOT EXISTS wallet_balance_new (
          user_id TEXT PRIMARY KEY,
          coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
          updated_at INTEGER NOT NULL
        );
      `);
      // Перенос данных. Если у кого-то уже отрицательный баланс (баг до фикса)
      // — clamp к 0 чтобы не уронить CHECK.
      db.execSync(`
        INSERT INTO wallet_balance_new (user_id, coins, updated_at)
        SELECT user_id, MAX(coins, 0), updated_at FROM wallet_balance;
      `);
      db.execSync(`DROP TABLE wallet_balance;`);
      db.execSync(`ALTER TABLE wallet_balance_new RENAME TO wallet_balance;`);
    });
    current = 19;
  }

  if (current < 20) {
    // Quick task: profile-clubs-polish — clubs end-to-end (local-first).
    // Никакого backend пока нет: данные живут только на этом устройстве,
    // owner_id = текущий пользователь, member-ids = выбранные друзья.
    // Будущая backend-синхронизация (CLUBS-BACKEND-SYNC, v1.0.1) использует
    // ту же схему.
    db.execSync(`
      CREATE TABLE IF NOT EXISTS clubs (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        avatar_color TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    db.execSync(
      `CREATE INDEX IF NOT EXISTS idx_clubs_owner ON clubs (owner_id);`,
    );
    db.execSync(`
      CREATE TABLE IF NOT EXISTS club_members (
        club_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (club_id, user_id)
      );
    `);
    db.execSync(
      `CREATE INDEX IF NOT EXISTS idx_club_members_user ON club_members (user_id);`,
    );
    current = 20;
  }

  if (current !== TARGET_VERSION) {
    throw new Error(
      `[storage] migration ended at version ${current}, expected ${TARGET_VERSION}`,
    );
  }
  db.execSync(`PRAGMA user_version = ${TARGET_VERSION};`);
}
