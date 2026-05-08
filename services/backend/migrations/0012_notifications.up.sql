-- Phase 8 / A4: push devices + in-app notifications.

CREATE TABLE IF NOT EXISTS push_devices (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expo_token  TEXT NOT NULL UNIQUE,                          -- ExponentPushToken[xxx]
    platform    TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    device_id   TEXT,                                          -- client-generated UUID
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_devices_user ON push_devices (user_id);

CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,                                 -- message.new | follow | mention | ...
    payload     JSONB NOT NULL,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON notifications (user_id, created_at DESC);

-- Per-user preferences (mute / disable categories).
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    push_enabled     BOOLEAN NOT NULL DEFAULT true,
    push_messages    BOOLEAN NOT NULL DEFAULT true,
    push_follows     BOOLEAN NOT NULL DEFAULT true,
    push_mentions    BOOLEAN NOT NULL DEFAULT true,
    quiet_hours_start INT,                                     -- 0..23, NULL = off
    quiet_hours_end   INT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
