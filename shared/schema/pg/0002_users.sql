-- Multi-tenant: per-user HMAC secret + bcrypt password
CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  secret          TEXT NOT NULL,
  is_owner        INTEGER NOT NULL DEFAULT 0,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users (updated_at);

-- Add user_id to notes; NOT NULL enforcement happens in bootstrap
-- after the default owner user is seeded.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes (user_id, updated_at);
