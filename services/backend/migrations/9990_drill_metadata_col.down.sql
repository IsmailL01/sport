-- Phase 4 / CICD-04: drill migration A — down.
-- Symmetric к 9990_drill_metadata_col.up.sql ADD COLUMN.

ALTER TABLE users DROP COLUMN IF EXISTS metadata;
