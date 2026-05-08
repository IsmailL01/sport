-- Phase 8 / C: stories (24h expiry) + story views.

CREATE TABLE IF NOT EXISTS stories (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media_id      UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    overlay_text  TEXT,                                          -- opt caption
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
    deleted_at    TIMESTAMPTZ
);

-- Активные stories по автору (для GET /stories/feed grouping by author).
CREATE INDEX IF NOT EXISTS idx_stories_author_expires
    ON stories (author_id, expires_at) WHERE deleted_at IS NULL;

-- Для cron-cleanup: найти просроченные за один pass.
CREATE INDEX IF NOT EXISTS idx_stories_expires
    ON stories (expires_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS story_views (
    story_id    UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    viewer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (story_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_story_views_story ON story_views (story_id);
