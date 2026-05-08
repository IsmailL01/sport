-- Phase 8 / D: feed — posts + likes + comments.
--
-- posts.kind:
--   'text'    — обычный текстовый пост (body required)
--   'photo'   — пост с прикреплённой картинкой (media_id required)
--   'session' — авто-share завершённой пробежки (session_ref required —
--               это session_server_id из activity-sync; client скачивает
--               данные сессии у /sessions service)
--
-- like_count + comment_count — денормализованные счётчики, обновляются
-- триггерами (см. ниже). Это позволяет рендерить feed без JOIN/COUNT.

CREATE TABLE IF NOT EXISTS posts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL CHECK (kind IN ('text','photo','session')),
    body          TEXT,                                              -- text content / caption
    media_id      UUID REFERENCES media(id) ON DELETE SET NULL,      -- для kind='photo'
    session_ref   TEXT,                                              -- для kind='session'
    like_count    INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    edited_at     TIMESTAMPTZ,
    deleted_at    TIMESTAMPTZ
);

-- Лента: WHERE author_id IN (followees) ORDER BY created_at DESC.
CREATE INDEX IF NOT EXISTS idx_posts_author_created
    ON posts (author_id, created_at DESC) WHERE deleted_at IS NULL;

-- Глобальная лента (admin / discover): все посты по времени.
CREATE INDEX IF NOT EXISTS idx_posts_created
    ON posts (created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS post_likes (
    post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);

-- "Кто лайкнул" + "что я лайкал" обратные lookup.
CREATE INDEX IF NOT EXISTS idx_post_likes_user
    ON post_likes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS post_comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL CHECK (length(body) <= 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- Cursor pagination по comments одного поста.
CREATE INDEX IF NOT EXISTS idx_post_comments_post_created
    ON post_comments (post_id, created_at DESC) WHERE deleted_at IS NULL;

-- === Триггеры для денормализованных счётчиков ===
--
-- Без них пришлось бы делать COUNT/JOIN на каждый feed-render.
-- Триггеры выполняются в той же транзакции что и INSERT/DELETE, так что
-- счётчик всегда консистентен с фактическими строками.

CREATE OR REPLACE FUNCTION posts_like_count_trigger() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE posts SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_post_likes_count
AFTER INSERT OR DELETE ON post_likes
FOR EACH ROW EXECUTE FUNCTION posts_like_count_trigger();

CREATE OR REPLACE FUNCTION posts_comment_count_trigger() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'UPDATE' THEN
        -- soft delete: deleted_at NULL → NOT NULL = убрать; обратно = вернуть.
        IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
            UPDATE posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = NEW.post_id;
        ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
            UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.deleted_at IS NULL THEN
            UPDATE posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.post_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_post_comments_count
AFTER INSERT OR UPDATE OF deleted_at OR DELETE ON post_comments
FOR EACH ROW EXECUTE FUNCTION posts_comment_count_trigger();
