const { generatePinyinForNote } = require('./pinyin')

function addNote(db, note) {
  return db.transaction(() => {
    const { title = '', content, tags = [], category = 'uncategorized',
            original_content = '', source_path = '', source_type = '',
            parent_id = null, source_range = '', is_atom = 0 } = note
    const clientId = (typeof note.client_id === 'string' && note.client_id) || require('crypto').randomUUID()
    const stmt = db.prepare(`
      INSERT INTO notes (client_id, content, title, category, tags, original_content, source_path, source_type,
                         parent_id, source_range, is_atom)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(clientId, content, title, category, JSON.stringify(tags), original_content,
      source_path, source_type, parent_id, source_range, is_atom)
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
    SELECT n.id, n.title, n.content, n.category, n.tags, n.created_at, n.source_path, n.source_type,
           n.parent_id, n.source_range, n.is_atom, n.extracted_at,
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
    WHERE notes_fts MATCH @fts AND n.deleted_at IS NULL
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
        WHERE (p.pinyin_title LIKE @py ESCAPE '\\' OR p.pinyin_content LIKE @py ESCAPE '\\') AND n.deleted_at IS NULL
        LIMIT @limit
      `).all({ py: `%${pyEscaped}%`, limit })
      const seen = new Set(ftsRows.map(r => r.id))
      for (const r of pyRows) {
        if (!seen.has(r.id)) ftsRows.push(r)
      }
    }
  }

  return ftsRows.map(row => ({ ...rowToNote(row), score: row.score }))
}


function getNoteById(db, id) {
  if (!id) return null
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
  if (!row) return null
  return rowToNote(row)
}


function rowToNote(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    tags: safeParseJSON(row.tags, []),
    created_at: row.created_at,
    source_path: row.source_path || '',
    source_type: row.source_type || '',
    parent_id: row.parent_id != null ? row.parent_id : null,
    source_range: row.source_range || '',
    is_atom: row.is_atom || 0,
    extracted_at: row.extracted_at != null ? row.extracted_at : null
  }
}

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str) } catch { return fallback }
}

function getRecentNotes(db, limit = 20) {
  if (!db) return []
  const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 20, 200))
  const rows = db.prepare(`
    SELECT id, title, content, category, tags, created_at, source_path, source_type
    FROM notes
    WHERE deleted_at IS NULL
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `).all(safeLimit)
  return rows.map(row => ({ ...rowToNote(row), score: 0 }))
}



function addAtomNote(db, { parentId, title, content, sourceRange, tags = [], source_path = '', source_type = '' }) {
  return addNote(db, {
    title, content, tags,
    parent_id: parentId,
    source_range: JSON.stringify(sourceRange || {}),
    is_atom: 1,
    source_path,
    source_type
  })
}

function getSourceNotes(db, { onlyUnExtracted = false, keyword = null } = {}) {
  let sql = 'SELECT * FROM notes WHERE is_atom = 0 AND deleted_at IS NULL'
  const params = {}
  if (onlyUnExtracted) sql += ' AND extracted_at IS NULL'
  if (keyword) {
    sql += ' AND (title LIKE @kw OR content LIKE @kw)'
    params.kw = '%' + keyword + '%'
  }
  sql += ' ORDER BY datetime(created_at) DESC, id DESC'
  const rows = db.prepare(sql).all(params)
  return rows.map(row => ({ ...rowToNote(row), score: 0 }))
}

module.exports = { searchNotes, addNote, addAtomNote, getNoteById, getRecentNotes, getSourceNotes, rowToNote }