/**
 * Embedding client.
 *
 * Calling convention: every public function returns null on any failure and
 * logs a warning. Embedding is an optional optimisation layer; we must NEVER
 * let a 500 from the embedding service break note add/update or search.
 *
 * Configuration lives in cfg.embedding = { baseURL, apiKey, model, dims }.
 * Default baseURL is the public SaaS endpoint (https://embedding.bjhzsk.cn)
 * shipped with the desktop client. Users can override in Settings.
 */

const DEFAULT_BASE_URL = 'https://embedding.bjhzsk.cn'
const DEFAULT_MODEL = 'bge-m3'
const DEFAULT_DIMS = 1024
const REQUEST_TIMEOUT_MS = 15000

function resolveConfig(embeddingCfg) {
  const emb = embeddingCfg || {}
  return {
    baseURL: (emb.baseURL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    apiKey: emb.apiKey || '',
    model: emb.model || DEFAULT_MODEL,
    dims: emb.dims || DEFAULT_DIMS
  }
}

function isConfigured(embeddingCfg) {
  return !!(embeddingCfg && embeddingCfg.baseURL)
}

/**
 * Compute one embedding for the given text.
 *
 * @param {string} text
 * @param {object} embeddingCfg   the cfg.embedding sub-object
 * @returns {Promise<number[]|null>}
 */
async function getEmbedding(text, embeddingCfg) {
  if (!text || !text.trim()) return null
  if (!isConfigured(embeddingCfg)) return null
  const cfg = resolveConfig(embeddingCfg)
  const url = `${cfg.baseURL}/v1/embeddings`
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: 'Bearer ' + cfg.apiKey } : {})
      },
      body: JSON.stringify({ model: cfg.model, input: text.slice(0, 8000) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    if (!r.ok) {
      console.warn('[embedding] http', r.status, await r.text().catch(() => ''))
      return null
    }
    const j = await r.json()
    const vec = j && j.data && j.data[0] && j.data[0].embedding
    if (!Array.isArray(vec) || vec.length === 0) {
      console.warn('[embedding] empty vector in response')
      return null
    }
    return vec
  } catch (e) {
    console.warn('[embedding] request failed:', e.message)
    return null
  }
}

module.exports = { getEmbedding, isConfigured, resolveConfig, DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_DIMS }
