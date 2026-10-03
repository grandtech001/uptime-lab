-- Monitors are the things we watch. One row per URL.
CREATE TABLE IF NOT EXISTS monitors (
  id           SERIAL PRIMARY KEY,
  name         TEXT        NOT NULL,
  url          TEXT        NOT NULL UNIQUE,
  interval_sec INTEGER     NOT NULL DEFAULT 60 CHECK (interval_sec >= 10),
  enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per probe. This is the table that grows without bound, so it is
-- also the one that makes backups and retention a real problem later.
CREATE TABLE IF NOT EXISTS checks (
  id          BIGSERIAL   PRIMARY KEY,
  monitor_id  INTEGER     NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ok          BOOLEAN     NOT NULL,
  status_code INTEGER,
  latency_ms  INTEGER,
  error       TEXT
);

CREATE INDEX IF NOT EXISTS checks_monitor_time_idx
  ON checks (monitor_id, checked_at DESC);
