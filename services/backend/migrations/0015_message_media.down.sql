ALTER TABLE messages DROP COLUMN IF EXISTS media_id;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_kind_check;
ALTER TABLE messages ADD CONSTRAINT messages_kind_check
    CHECK (kind IN ('text', 'media', 'system'));
