-- Phase 6.5: aggregated HR на session row.
-- Клиент считает на finalize и присылает в /sessions POST.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS avg_hr_bpm DOUBLE PRECISION;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS max_hr_bpm DOUBLE PRECISION;
