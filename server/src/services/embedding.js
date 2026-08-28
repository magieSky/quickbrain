/**
 * Embedding service (server-side).
 *
 * Talks to the internal Ollama HTTP endpoint configured by env:
 *   OLLAMA_URL  (default http://127.0.0.1:11434)
 *   EMBED_MODEL (default bge-m3)
 *   EMBED_DIMS  (default 1024)
 *
 * Calling convention: every public function returns null on any failure and
 * logs a warning. Embedding is an optional optimisation layer; we must NEVER
 * let a 500 from the embedding service break note add/update.
 */

const { sql } = require('kysely')

const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'
const DEFAULT_MODEL = process.env.EMBED_MODEL || 'bge-m3'
const DEFAULT_DIMS = parseInt(process.env.EMBED_DIMS || '1024', 10) || 1024
const REQUEST_TIMEOUT_MS = 15000

function config() {
  return { ollamaUrl: DEFAULT_OLLAMA_URL.replace(/\/+$/, ''), model: DEFAULT_MODEL, dims: DEFAULT_DIMS }
}

function isConfigured() {
  return !!DEFAULT_OLLAMA_URL
}

/**
 * Compute one embedding for the given text via Ollama's /api/embeddings.
 * Returns null on any error so callers can treat embedding as best-effort.
 */
async function getEmbedding(text) {
  if (!text || !text.trim()) return null
  if (!isConfigured()) return null
  const cfg = config()
  try {
    const r = await fetch(cfg.ollamaUrl + '/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, prompt: text.slice(0, 8000) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    if (!r.ok) {
      console.warn('[embed-svc] ollama http', r.status, await r.text().catch(() => ''))
      return null
    }
    const j = await r.json()
    const vec = j && j.embedding
    if (!Array.isArray(vec) || vec.length === 0) {
      console.warn('[embed-svc] empty vector in response')
      return null
    }
    return vec
  } catch (e) {
    console.warn('[embed-svc] request failed:', e.message)
    return null
  }
}

async function upsertEmbedding(db, noteId, vec) {
  if (!db || !noteId) return false
  if (!Array.isArray(vec) || vec.length === 0) return false
  try {
    const literal = '[' + vec.join(',') + ']'
    await sql`
      INSERT INTO notes_vec (note_id, embedding, model, status, updated_at)
      VALUES (${noteId}, ${literal}::vector, ${DEFAULT_MODEL}, 'ok', ${Date.now()})
      ON CONFLICT (note_id) DO UPDATE SET
        embedding = EXCLUDED.embedding,
        model = EXCLUDED.model,
        status = 'ok',
        error = NULL,
        updated_at = EXCLUDED.updated_at
    `.execute(db)
    return true
  } catch (e) {
    console.warn('[embed-svc] upsertEmbedding failed:', e.message)
    return false
  }
}

async function deleteEmbedding(db, noteId) {
  if (!db || !noteId) return
  try {
    await sql`DELETE FROM notes_vec WHERE note_id = ${noteId}`.execute(db)
  } catch (e) {
    console.warn('[embed-svc] deleteEmbedding failed:', e.message)
  }
}

function scheduleEmbed(db, noteId, text) {
  if (!db || !noteId || !text || !text.trim()) return
  ;(async () => {
    try {
      const v = await getEmbedding(text)
      if (v) await upsertEmbedding(db, noteId, v)
      else console.warn('[embed-svc] no vector for note', noteId)
    } catch (e) {
      console.warn('[embed-svc] scheduleEmbed error:', e.message)
    }
  })()
}

function scheduleEmbedDelete(db, noteId) {
  if (!db || !noteId) return
  deleteEmbedding(db, noteId).catch(() => {})
}

module.exports = {
  getEmbedding, upsertEmbedding, deleteEmbedding,
  scheduleEmbed, scheduleEmbedDelete,
  isConfigured, config
}
