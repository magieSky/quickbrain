-- 0005_rev.sql: revision counter for sync LWW conflict detection
ALTER TABLE notes ADD COLUMN rev INTEGER DEFAULT 1;
