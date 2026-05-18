-- Phase 4 / CICD-04: drill migration B — drops the drill column added by 9990.
--
-- This is the migration that the DRILL's `make rollback v=v1.0.0-rc.test-a` undoes
-- (via `migrate down 1` — runs 9991_drill_drop_metadata_col.down.sql which
-- re-adds the column). Restoring A's schema state.
--
-- Idempotent via IF EXISTS — safe к replay.

ALTER TABLE users DROP COLUMN IF EXISTS metadata;
