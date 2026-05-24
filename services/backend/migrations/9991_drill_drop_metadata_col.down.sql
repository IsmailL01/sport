-- Phase 4 / CICD-04: drill migration B — down (re-creates column when rolling back B).
--
-- Data loss for any rows written между B's deploy и rollback — acceptable
-- since no real code reads users.metadata (drill column only). For production
-- migrations, this kind of asymmetric add↔drop would require explicit data
-- preservation procedure (см. docs/RUNBOOKS/deploy.md §7 для future schema changes).

ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
