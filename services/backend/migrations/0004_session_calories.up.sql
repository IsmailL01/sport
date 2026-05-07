-- Phase 6.5+: estimated calories на session row.
-- Клиент считает MET-based на finalize и отправляет в /sessions POST.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS calories_kcal DOUBLE PRECISION;
