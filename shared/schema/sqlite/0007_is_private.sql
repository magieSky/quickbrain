-- 0007_is_private.sql
-- Privacy flag for sync: 1 = private (stays local, never queued for upload),
-- 0 = public (eligible for push to SaaS).
-- Default is 1 (private) so a fresh install is private-by-default and the
-- user has to opt-in to cloud sync per note (or globally via settings).
ALTER TABLE notes ADD COLUMN is_private INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_notes_is_private ON notes(is_private);
