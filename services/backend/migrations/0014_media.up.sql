-- Phase 8 / B3: media files (image/video/audio) metadata + S3 references.

CREATE TABLE IF NOT EXISTS media (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL CHECK (kind IN ('image', 'video', 'audio')),
    mime         TEXT NOT NULL,
    size_bytes   BIGINT NOT NULL,
    s3_key       TEXT NOT NULL UNIQUE,
    status       TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'ready', 'failed')),
    thumb_key    TEXT,
    width        INTEGER,
    height       INTEGER,
    duration_ms  INTEGER,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_media_owner ON media (owner_id);
CREATE INDEX IF NOT EXISTS idx_media_status ON media (status) WHERE status = 'pending';
