-- Phase 8 / E: модерация — reports + audit_log.
--
-- reports: пользователь жалуется на контент или другого юзера. Admin/moderator
-- видит open/under_review reports и резолвит.
--
-- audit_log: каждое state-changing действие (delete, block, ban, role-change,
-- resolve-report) пишется в audit_log в той же транзакции. Это bedrock
-- correctness — не зависим от NATS health для непотери истории действий.

CREATE TABLE IF NOT EXISTS reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- target_kind: 'message' | 'post' | 'comment' | 'story' | 'user'
    target_kind     TEXT NOT NULL CHECK (target_kind IN ('message','post','comment','story','user')),
    target_id       TEXT NOT NULL,                        -- UUID либо UUID-as-text (cross-service refs)
    reason          TEXT NOT NULL CHECK (reason IN ('spam','harassment','nudity','violence','illegal','other')),
    body            TEXT,                                 -- свободное описание от reporter (опц.)
    status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_review','resolved','rejected')),
    -- Результат разбора:
    resolution_action TEXT,                               -- 'delete' | 'warn' | 'ban' | 'mute' | 'no_action'
    resolved_at     TIMESTAMPTZ,
    resolved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin queue: WHERE status IN ('open','under_review') ORDER BY created_at ASC.
CREATE INDEX IF NOT EXISTS idx_reports_status_created
    ON reports (status, created_at) WHERE status IN ('open','under_review');

-- "Что я зарепортил": для UI showing my reports list.
CREATE INDEX IF NOT EXISTS idx_reports_reporter
    ON reports (reporter_id, created_at DESC);

-- Все reports на конкретный контент (для admin при triaging).
CREATE INDEX IF NOT EXISTS idx_reports_target
    ON reports (target_kind, target_id);

-- audit_log: универсальный append-only журнал.
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL после delete-account
    action      TEXT NOT NULL,                                  -- 'delete_post', 'block_user', 'resolve_report', etc
    target_kind TEXT NOT NULL,                                  -- 'post' | 'message' | 'user' | 'report' | ...
    target_id   TEXT NOT NULL,
    before_data JSONB,                                          -- snapshot до изменения (NULL для create)
    after_data  JSONB,                                          -- snapshot после (NULL для delete)
    metadata    JSONB,                                          -- доп. контекст (reason, resolution, etc)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Поиск по actor (пользовательская история действий).
CREATE INDEX IF NOT EXISTS idx_audit_actor_created
    ON audit_log (actor_id, created_at DESC);

-- Поиск по target (что произошло с конкретным контентом).
CREATE INDEX IF NOT EXISTS idx_audit_target
    ON audit_log (target_kind, target_id, created_at DESC);

-- Поиск по action (метрики: сколько delete_post в день).
CREATE INDEX IF NOT EXISTS idx_audit_action_created
    ON audit_log (action, created_at DESC);
