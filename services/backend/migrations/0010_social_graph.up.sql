-- Phase 8 / Phase A: social graph foundation.
-- profiles (extension users), follows, user_blocks.
--
-- См. план: services/backend/social-graph принимает запросы /profiles, /follows, /blocks.

-- citext — case-insensitive username lookup
CREATE EXTENSION IF NOT EXISTS citext;
-- pg_trgm — для search by username/display_name через trigram
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS profiles (
    user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    username         CITEXT UNIQUE,                                       -- @handle
    display_name     TEXT,
    bio              TEXT,
    avatar_media_id  UUID,
    privacy          TEXT NOT NULL DEFAULT 'public'
                       CHECK (privacy IN ('public', 'followers', 'private')),
    global_role      TEXT NOT NULL DEFAULT 'user'
                       CHECK (global_role IN ('user', 'premium', 'moderator', 'admin')),
    banned_until     TIMESTAMPTZ,
    last_seen_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigram indexes для search-by-username и search-by-display_name.
CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm
    ON profiles USING GIN (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm
    ON profiles USING GIN (display_name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS follows (
    follower_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followee_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, followee_id),
    CHECK (follower_id <> followee_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_followee
    ON follows (followee_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked
    ON user_blocks (blocked_id);
