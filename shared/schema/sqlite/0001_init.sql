-- QuickBrain client SQLite schema (0001_init.sql)
-- Covers notes + FTS + pinyin + sync_meta + sync_outbox + migration bookkeeping.

-- 主表
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  title TEXT DEFAULT '',
  category TEXT DEFAULT 'uncategorized',
  tags TEXT DEFAULT '[]',
  is_formatted INTEGER DEFAULT 0,
  original_content TEXT DEFAULT '',
  source_path TEXT DEFAULT '',
  source_type TEXT DEFAULT '',
  parent_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
  source_range TEXT DEFAULT '',
  is_atom INTEGER DEFAULT 0,
  extracted_at INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category);

-- FTS5 虚拟表
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title,
  content,
  tags,
  content='notes',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

-- 同步触发器
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, content, tags)
  VALUES (new.id, new.title, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content, tags)
  VALUES('delete', old.id, old.title, old.content, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content, tags)
  VALUES('delete', old.id, old.title, old.content, old.tags);
  INSERT INTO notes_fts(rowid, title, content, tags)
  VALUES (new.id, new.title, new.content, new.tags);
END;

-- 拼音辅助表
CREATE TABLE IF NOT EXISTS notes_pinyin (
  id INTEGER PRIMARY KEY,
  pinyin_title TEXT DEFAULT '',
  pinyin_content TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_notes_pinyin_title ON notes_pinyin(pinyin_title);
CREATE INDEX IF NOT EXISTS idx_notes_pinyin_content ON notes_pinyin(pinyin_content);

-- sync metadata (one row per device)
CREATE TABLE IF NOT EXISTS sync_meta (
  device_id        TEXT PRIMARY KEY,
  last_pull_cursor INTEGER NOT NULL DEFAULT 0,
  last_push_at     INTEGER NOT NULL DEFAULT 0,
  outbox_seq       INTEGER NOT NULL DEFAULT 0
);

-- outbox: rows pending push
CREATE TABLE IF NOT EXISTS sync_outbox (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  op           TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
  note_id      INTEGER,
  payload      TEXT NOT NULL,
  enqueued_at  INTEGER NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_enqueued_at ON sync_outbox(enqueued_at);

-- migration bookkeeping
CREATE TABLE IF NOT EXISTS schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  INTEGER NOT NULL
);