const { getDB } = require('./db-init')
const { getNoteById, addAtomNote } = require('./db/search')

const STATUS = { PENDING: null, FAILED: -1 }

let _aiService = null
function setExtractorAIService(svc) { _aiService = svc; console.log('[notes-extractor] AI service set:', svc ? svc.getInfo ? svc.getInfo().provider : 'unknown' : 'null') }
function getAIService() { return _aiService }

function safeParse(s, fallback) { try { return JSON.parse(s) } catch { return fallback } }

async function extractAtomsForSource(sourceId, { force = false } = {}) {
  const db = getDB()
  const source = getNoteById(db, sourceId)
  if (!source) { console.log('[notes-extractor] source not found', sourceId); return { ok: false, error: 'not-found' } }
  if (!force && source.extracted_at && source.extracted_at !== STATUS.FAILED) {
    console.log('[notes-extractor] skip already-extracted source', sourceId, 'extracted_at=' + source.extracted_at)
    return { ok: true, skipped: true }
  }

  const aiService = getAIService()
  if (!aiService) {
    console.log('[notes-extractor] no ai service for source', sourceId)
    db.prepare('UPDATE notes SET extracted_at = ? WHERE id = ?').run(STATUS.PENDING, sourceId)
    return { ok: false, error: 'ai-not-configured' }
  }

  console.log('[notes-extractor] extracting atoms for source', sourceId, 'title=' + JSON.stringify(source.title))
  try {
    const atoms = await aiService.extractAtoms({
      title: source.title,
      content: source.content
    })
    console.log('[notes-extractor] ai returned', atoms.length, 'atoms for source', sourceId)
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
    console.log('[notes-extractor] inserted', count, 'atoms for source', sourceId)
    return { ok: true, count }
  } catch (e) {
    console.error('[notes-extractor] failed for', sourceId, e.message)
    db.prepare('UPDATE notes SET extracted_at = ? WHERE id = ?').run(STATUS.FAILED, sourceId)
    return { ok: false, error: e.message }
  }
}

module.exports = { extractAtomsForSource, setExtractorAIService }