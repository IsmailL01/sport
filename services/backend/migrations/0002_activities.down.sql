-- Drop в обратном порядке: hypertable → таблицы.
-- Hypertable удаляется обычным DROP TABLE (TimescaleDB подхватит).
DROP TABLE IF EXISTS points;
DROP TABLE IF EXISTS sessions;
