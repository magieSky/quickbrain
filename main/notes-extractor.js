const { getDB } = require('./db-init')
const { getNoteById, addAtomNote } = require('./db/search')

const STATUS = { PENDING: null, FAILED: -1 }

let _aiService = null
function setExtractorAIService(svc) { _aiService = svc }
function getAIService() { return _aiService }

function safeParse(s, fallback) { try { return JSON.parse(s) } catch { return fallback } }

async function extractAtomsForSource(sourceId, { force = false } = {}) {
  const db = getDB()
  const source = getNoteById(db, sourceId)
  if (!source) return { ok: false, error: 'not-found' }
  if (!force && source.extracted_at && source.extracted_at !== STATUS.FAILED) {
    return { ok: true, skipped: true }
  }

  const aiService = getAIService()
  if (!aiService) {
    db.prepare('UPDATE notes SET extracted_at = ? WHERE id = ?').run(STATUS.PENDING, sourceId)
    return { ok: false, error: 'ai-not-configured' }
  }

  try {
    const atoms = await aiService.extractAtoms({
      title: source.title,
      content: source.content
    })
    if (force) {
      db.prepare('DELETE FROM notes WHERE parent_id = ?').run(sourceId)
    }
    let count = 0
    for (const atom of atoms) {
      addAtomNote(db, {
        parentId: sourceId,
        title: atom.title,
        content: atom.content,
        sourceRange: atom.source_range,
        tags: safeParse(source.tags, []),
        source_path: source.source_path,
        source_type: source.source_type
      })
      count++
    }
    db.prepare('UPDATE notes SET extracted_at = ? WHERE id = ?').run(Date.now(), sourceId)
    return { ok: true, count }
  } catch (e) {
    console.error('[notes-extractor] failed for', sourceId, e.message)
    db.prepare('UPDATE notes SET extracted_at = ? WHERE id = ?').run(STATUS.FAILED, sourceId)
    return { ok: false, error: e.message }
  }
}

module.exports = { extractAtomsForSource, setExtractorAIService }