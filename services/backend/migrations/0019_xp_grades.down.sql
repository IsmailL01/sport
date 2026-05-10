DROP INDEX IF EXISTS idx_profiles_grade;
DROP INDEX IF EXISTS idx_profiles_xp_total;
ALTER TABLE sessions DROP COLUMN IF EXISTS xp_awarded;
ALTER TABLE profiles
    DROP COLUMN IF EXISTS verified,
    DROP COLUMN IF EXISTS grade,
    DROP COLUMN IF EXISTS xp_total;
