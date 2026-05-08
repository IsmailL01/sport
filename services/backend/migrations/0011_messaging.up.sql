-- Phase 8 / A2: messaging — conversations, members, messages, outbox.
-- DM (1:1) + group в одной таблице conversations с типом.

CREATE TABLE IF NOT EXISTS conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            TEXT NOT NULL CHECK (type IN ('dm', 'group')),
    title           TEXT,                                   -- groups only
    avatar_media_id UUID,
    created_by      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ,                            -- денормализация для sort
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_conversations_last_message
    ON conversations (last_message_at DESC NULLS LAST);

-- Быстрый lookup DM по паре юзеров. user_a < user_b лексикографически.
CREATE TABLE IF NOT EXISTS dm_pairs (
    user_a          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    PRIMARY KEY (user_a, user_b),
    CHECK (user_a < user_b)
);

CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id      UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role                 TEXT NOT NULL DEFAULT 'member'
                           CHECK (role IN ('owner', 'admin', 'moderator', 'member', 'restricted')),
    joined_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_read_message_id UUID,
    muted_until          TIMESTAMPTZ,
    notif_level          TEXT NOT NULL DEFAULT 'all'
                           CHECK (notif_level IN ('all', 'mentions', 'none')),
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_members_user
    ON conversation_members (user_id);

-- Messages — пока без range partitioning (сделаем когда дойдёт до миллионов).
-- Существенный индекс — (conversation_id, created_at DESC) для cursor pagination.
CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_msg_id   UUID NOT NULL,                          -- idempotency
    kind            TEXT NOT NULL CHECK (kind IN ('text', 'media', 'system')),
    body            TEXT,                                   -- text или caption
    reply_to_id     UUID REFERENCES messages(id) ON DELETE SET NULL,
    edited_at       TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ,
    flagged         BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (conversation_id, client_msg_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_created
    ON messages (conversation_id, created_at DESC, id);

-- Outbox: каждое state-changing событие пишется здесь в той же tx что и domain row.
-- Sidecar goroutine публикует в NATS и проставляет published_at.
-- Гарантирует exactly-once event publishing даже если NATS down.
CREATE TABLE IF NOT EXISTS messaging_outbox (
    id            BIGSERIAL PRIMARY KEY,
    event_subject TEXT NOT NULL,
    payload       JSONB NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_messaging_outbox_unpublished
    ON messaging_outbox (created_at) WHERE published_at IS NULL;
