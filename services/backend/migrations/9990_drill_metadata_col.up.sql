-- Phase 4 / CICD-04: drill migration A — backward-compatible NULLABLE column add.
--
-- Numbered 9990 (NOT 0021+) per RESEARCH §Open Q 4 — collision-safe с Phase 7
-- production migrations (Phase 7 reserves 0022+ для R18 zero-downtime backfill).
--
-- TRANSIENT: drill column для rollback verification. NO application code reads OR
-- writes users.metadata. Safe к drop at any time. May be removed после drill closes
-- (per Plan 04-04 Task 6 user preference — default = keep as historical record).
--
-- Backward-compat per RESEARCH Pitfall 5: ADD COLUMN IF NOT EXISTS is idempotent;
-- JSONB DEFAULT NULL imposes no constraint on existing rows.

ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

COMMENT ON COLUMN users.metadata IS
  'Drill column для CICD-04 rollback drill. Unused by application code. Safe к drop.';
