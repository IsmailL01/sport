-- Phase 8 / M3: XP + grade + verification flag на profiles.
--
-- xp_total — кумулятивный счёт experience points (formula в pkg/gamification).
-- grade — производное от xp_total через GradeForXP(). Кэшируется в столбце
-- чтобы leaderboard / search не пересчитывали на каждый запрос.
-- verified — KYC / профессиональный бегун (CTA на ProfileScreen). Заглушка
-- на M3; реальный flow Phase N+.
--
-- Все NOT NULL DEFAULT — backfill happens automatically.

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS xp_total INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT 'D',
    ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;

-- Idempotency: track XP уже выдан за конкретную сессию. Replay-safe:
-- если клиент загружает session повторно (multi-device sync), не выдаём
-- XP дважды. Текущий awarded == 0 → впервые финализируем; > 0 → уже было.
ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS xp_awarded INTEGER NOT NULL DEFAULT 0;

-- Leaderboard index — TOP-100 by xp_total DESC.
CREATE INDEX IF NOT EXISTS idx_profiles_xp_total
    ON profiles (xp_total DESC);

-- Search-by-grade (для club challenges later) — partial index.
CREATE INDEX IF NOT EXISTS idx_profiles_grade
    ON profiles (grade);

COMMENT ON COLUMN profiles.xp_total IS 'Cumulative XP across all finalized sessions. Formula: pkg/gamification.XPForSession.';
COMMENT ON COLUMN profiles.grade IS 'Cached grade letter (D/D+/C/.../S) derived from xp_total via pkg/gamification.GradeForXP.';
COMMENT ON COLUMN profiles.verified IS 'KYC / verified status. Phase N+ flow.';
