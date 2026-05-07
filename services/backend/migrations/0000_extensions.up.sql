-- Расширения Postgres, нужные доменной схеме.
-- citext — case-insensitive email (без LOWER() в каждом запросе).
-- pgcrypto — gen_random_uuid().
-- TimescaleDB — будет нужен для points hypertable (P2-A-06).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
