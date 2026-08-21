-- 主表
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  title TEXT DEFAULT '',
  category TEXT DEFAULT 'uncategorized',
  tags TEXT DEFAULT '[]',
  is_formatted INTEGER DEFAULT 0,
  original_content TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);

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