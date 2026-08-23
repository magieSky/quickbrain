-- 0004_deleted_at.sql: soft delete tombstone for sync
ALTER TABLE notes ADD COLUMN deleted_at INTEGER;
