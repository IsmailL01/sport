-- Phase 2 / P2-A-05 — схема активностей и time-series точек.
-- ТЗ §5.2: точки в TimescaleDB (hypertable, partition по time).

-- Сессия пробежки. Метаданные хранятся в обычной Postgres-таблице.
CREATE TABLE sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- ID на стороне клиента (epoch ms на момент start). Через эту пару
    -- (user_id, client_session_id) идемпотентность POST /sessions для outbox sync.
    client_session_id   BIGINT NOT NULL,
    started_at          TIMESTAMPTZ NOT NULL,
    ended_at            TIMESTAMPTZ,
    is_closed           BOOLEAN,
    distance_m          DOUBLE PRECISION,
    area_m2             DOUBLE PRECISION,
    -- shoelace_simple | shoelace_with_warning | corridor (см. ТЗ §6.6)
    calc_method         TEXT,
    note                TEXT,
    -- 'phone' (Phase 2), позже добавятся 'garmin', 'strava', 'polar' и т.п. (Phase 7).
    source              TEXT NOT NULL DEFAULT 'phone',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, client_session_id)
);

CREATE INDEX idx_sessions_user_started ON sessions (user_id, started_at DESC);

-- Точки трека — TimescaleDB hypertable.
-- Schema совпадает с client SQLite (см. apps/mobile-rn/src/storage/database.ts)
-- кроме session_id (UUID на сервере, BIGINT на клиенте — мапится через
-- sessions.client_session_id).
CREATE TABLE points (
    session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    ts          TIMESTAMPTZ NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lon         DOUBLE PRECISION NOT NULL,
    alt         REAL,
    accuracy    REAL,
    speed       REAL,
    -- raw | kalman | interpolated — см. apps/mobile-rn/src/domain/types.ts
    source      TEXT NOT NULL DEFAULT 'raw',
    PRIMARY KEY (session_id, ts)
);

-- TimescaleDB: hypertable с партицированием по 7 дней.
-- ts должен быть TIMESTAMPTZ — TimescaleDB требует time-based column.
SELECT create_hypertable('points', 'ts', chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);

-- Для быстрого поиска точек сессии в нужном time window.
CREATE INDEX idx_points_session_ts ON points (session_id, ts DESC);
