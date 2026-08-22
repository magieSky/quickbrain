const { generatePinyinForNote } = require('./pinyin')

function addNote(db, note) {
  return db.transaction(() => {
    const { title = '', content, tags = [], category = 'uncategorized',
            original_content = '' } = note
    const stmt = db.prepare(`
      INSERT INTO notes (content, title, category, tags, original_content)
      VALUES (?, ?, ?, ?, ?)
    `)
    const result = stmt.run(content, title, category, JSON.stringify(tags), original_content)
    const id = result.lastInsertRowid
    const py = generatePinyinForNote(title, content)
    db.prepare(`INSERT INTO notes_pinyin (id, pinyin_title, pinyin_content) VALUES (?, ?, ?)`)
      .run(id, py.pinyinTitle, py.pinyinContent)
    return id
  })()
}

function searchNotes(db, query, limit = 20) {
  if (!query || !query.trim()) return []

  const trimmed = query.trim()
  const likeEscaped = trimmed.replace(/[\\%_]/g, '\\$&')
  const prefix = `${likeEscaped}%`
  const contains = `%${likeEscaped}%`
  const ftsEscaped = trimmed.replace(/"/g, '""')
  const ftsQuery = `"${ftsEscaped}"*`

  // 1. FTS5 精确匹配（按 title 命中优先，再按 bm25 相关性）
  const ftsRows = db.prepare(`
    SELECT n.id, n.title, n.content, n.category, n.tags, n.created_at,
           bm25(notes_fts) AS score,
           CASE
             WHEN n.title LIKE @prefix ESCAPE '\\' THEN 5
             WHEN n.title LIKE @contains ESCAPE '\\' THEN 3
             WHEN n.content LIKE @prefix ESCAPE '\\' THEN 2
             WHEN n.content LIKE @contains ESCAPE '\\' THEN 1
             ELSE 0
           END AS title_score
    FROM notes_fts
    JOIN notes n ON n.id = notes_fts.rowid
    WHERE notes_fts MATCH @fts
    ORDER BY title_score DESC, score
    LIMIT @limit
  `).all({ prefix, contains, fts: ftsQuery, limit })

  // 2. 拼音兜底（FTS5 结果 < 3 时）
  if (ftsRows.length < 3) {
    const py = require('./pinyin').pinyinInitials(trimmed).replace(/\s+/g, '')
    if (py) {
      const pyEscaped = py.replace(/[\\%_]/g, '\\$&')
      const pyRows = db.prepare(`
        SELECT n.id, n.title, n.content, n.category, n.tags, n.created_at,
               0 AS score, 1 AS title_score
        FROM notes_pinyin p
        JOIN notes n ON n.id = p.id
        WHERE p.pinyin_title LIKE @py ESCAPE '\\' OR p.pinyin_content LIKE @py ESCAPE '\\'
        LIMIT @limit
      `).all({ py: `%${pyEscaped}%`, limit })
      const seen = new Set(ftsRows.map(r => r.id))
      for (const r of pyRows) {
        if (!seen.has(r.id)) ftsRows.push(r)
      }
    }
  }

  return ftsRows.map(row => ({
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    tags: safeParseJSON(row.tags, []),
    created_at: row.created_at,
    score: row.score
  }))
}


function getNoteById(db, id) {
  if (!id) return null
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    tags: safeParseJSON(row.tags, []),
    created_at: row.created_at
  }
}

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str) } catch { return fallback }
}

module.exports = { searchNotes, addNote }