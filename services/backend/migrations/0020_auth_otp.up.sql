-- Phase 8 / M4: email + OTP (passwordless) auth flow.
--
-- auth_otp_codes — короткоживущие 6-значные коды для login.
--
-- TTL = 10 минут (server enforced via expires_at). После used_at SET — код
-- невалиден. attempts ограничивается до 5 (anti-bruteforce).
--
-- Один email может иметь несколько кодов (старые становятся не-active при
-- генерации нового), но active query фильтрует по used_at IS NULL AND
-- expires_at > now().
--
-- Безопасность: код хранится plaintext (6 цифр × 10мин TTL × rate-limit 5/h).
-- Bruteforce cost: 10^6 × hop через rate-limit = неприемлемо. Phase N+ можно
-- добавить bcrypt-hash для defense-in-depth, но overhead не оправдывается для
-- 6-digit code.

CREATE TABLE IF NOT EXISTS auth_otp_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       CITEXT NOT NULL,
    code        TEXT NOT NULL CHECK (length(code) = 6),
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    attempts    INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hot path: SELECT … WHERE email = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1.
CREATE INDEX IF NOT EXISTS idx_auth_otp_active
    ON auth_otp_codes (email, created_at DESC) WHERE used_at IS NULL;

-- Cleanup cron: DELETE WHERE expires_at < now() - interval '1 day'.
CREATE INDEX IF NOT EXISTS idx_auth_otp_expires
    ON auth_otp_codes (expires_at);

COMMENT ON TABLE auth_otp_codes IS 'Passwordless OTP codes for email login (Phase 8 / M4).';
