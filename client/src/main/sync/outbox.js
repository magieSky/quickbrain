function append(db, { op, noteId = null, payload }) {
  const stmt = db.prepare('INSERT INTO sync_outbox (op, note_id, payload, enqueued_at, attempts) VALUES (?, ?, ?, ?, 0)')
  const r = stmt.run(op, noteId, JSON.stringify(payload), Date.now())
  return r.lastInsertRowid
}

function listForPush(db, limit = 50) {
  const rows = db.prepare('SELECT * FROM sync_outbox ORDER BY seq ASC LIMIT ?').all(limit)
  return rows.map(r => ({ ...r, payload: JSON.parse(r.payload) }))
}

function pending(db) {
  return listForPush(db, 1000)
}

function markAcked(db, seqs) {
  if (!seqs.length) return 0
  const stmt = db.prepare('DELETE FROM sync_outbox WHERE seq = ?')
  let n = 0
  db.transaction(() => { for (const s of seqs) { stmt.run(s); n++ } })()
  return n
}

function setLastError(db, seq, err) {
  db.prepare('UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE seq = ?').run(String(err).slice(0, 500), seq)
}

module.exports = { append, listForPush, pending, markAcked, setLastError }