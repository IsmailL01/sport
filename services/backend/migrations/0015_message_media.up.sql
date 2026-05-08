-- Phase 8 / B3: link messages to media items.
-- One-to-one для MVP (можно расширить до N через message_media join в Phase B3.5).

ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_id UUID
    REFERENCES media(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_media ON messages (media_id) WHERE media_id IS NOT NULL;

-- Расширяем kind CHECK constraint чтобы принимать 'image' и 'video'.
-- (PostgreSQL CHECK constraint не позволяет ALTER, нужно DROP + ADD.)
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_kind_check;
ALTER TABLE messages ADD CONSTRAINT messages_kind_check
    CHECK (kind IN ('text', 'media', 'image', 'video', 'audio', 'system'));
