-- QuickBrain server schema (postgres). 0001_init.sql
-- Notes table mirrors the client columns. client_id is the immutable per-device merge key.

CREATE TABLE IF NOT EXISTS notes (
  id                BIGSERIAL PRIMARY KEY,
  client_id         TEXT NOT NULL,
  content           TEXT NOT NULL,
  title             TEXT NOT NULL DEFAULT '',
  category          TEXT NOT NULL DEFAULT 'uncategorized',
  tags              JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_formatted      INTEGER NOT NULL DEFAULT 0,
  original_content  TEXT NOT NULL DEFAULT '',
  source_path       TEXT NOT NULL DEFAULT '',
  source_type       TEXT NOT NULL DEFAULT '',
  parent_id         TEXT,
  source_range      TEXT NOT NULL DEFAULT '',
  is_atom           INTEGER NOT NULL DEFAULT 0,
  extracted_at      BIGINT,
  created_at        BIGINT NOT NULL,
  updated_at        BIGINT NOT NULL,
  deleted_at        BIGINT,
  rev               INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_client_id ON notes (client_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes (updated_at);
CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes (deleted_at);
CREATE INDEX IF NOT EXISTS idx_notes_parent_id ON notes (parent_id);
CREATE INDEX IF NOT EXISTS idx_notes_is_atom ON notes (is_atom);

-- Devices
CREATE TABLE IF NOT EXISTS devices (
  device_id   TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  platform    TEXT NOT NULL DEFAULT 'unknown',
  client_ver  TEXT NOT NULL DEFAULT '',
  last_seen   BIGINT NOT NULL,
  revoked_at  BIGINT,
  created_at  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices (last_seen);

-- Encrypted config (AI settings etc.)
CREATE TABLE IF NOT EXISTS config (
  key         TEXT PRIMARY KEY,
  value_enc   BYTEA NOT NULL,
  updated_at  BIGINT NOT NULL
);

-- Shadow outbox: a server-side queue for extraction jobs and similar background work
CREATE TABLE IF NOT EXISTS sync_outbox_shadow (
  id           BIGSERIAL PRIMARY KEY,
  client_id    TEXT,
  op           TEXT NOT NULL,
  payload      JSONB NOT NULL,
  enqueued_at  BIGINT NOT NULL,
  processed_at BIGINT
);

-- Migration bookkeeping
CREATE TABLE IF NOT EXISTS schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  BIGINT NOT NULL
);