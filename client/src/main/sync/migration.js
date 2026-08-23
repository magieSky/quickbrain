const cfg = require('../config')
const meta = require('./meta')
const outbox = require('./outbox')
const syncClient = require('./client')

async function pushAllToServer({ db, serverUrl, bearer, deviceId, batchSize = 100 } = {}) {
  if (!db) throw new Error('db required')
  if (!serverUrl) throw new Error('serverUrl required')
  if (!bearer) bearer = (cfg && cfg.buildBearer) ? cfg.buildBearer() : null
  if (!bearer) throw new Error('bearer required')
  if (!deviceId) deviceId = (cfg && cfg.ensureDeviceId) ? cfg.ensureDeviceId() : null

  const rows = db.prepare('SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY id ASC').all()
  let totalAccepted = 0
  let totalConflicts = 0

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const ops = batch.map(r => ({
      op: 'upsert',
      note: {
        client_id: r.client_id,
        content: r.content || '',
        title: r.title || '',
        category: r.category || 'uncategorized',
        tags: r.tags ? JSON.parse(r.tags) : [],
        source_path: r.source_path || '',
        source_type: r.source_type || '',
        parent_id: r.parent_id || null,
        source_range: r.source_range || '',
        is_atom: r.is_atom || 0,
        extracted_at: r.extracted_at || null,
        updated_at: typeof r.updated_at === 'string'
          ? new Date(r.updated_at).getTime()
          : (r.updated_at || Date.now()),
        deleted_at: r.deleted_at || null,
        rev: r.rev || 1
      }
    }))
    try {
      const r = await syncClient.push({ serverUrl, bearer, deviceId, ops })
      totalAccepted += (r.accepted || 0)
      totalConflicts += (r.conflicts || []).length
    } catch (e) {
      console.error('[migration] batch push failed:', e.message)
      throw e
    }
  }

  if (deviceId) meta.setLastPushAt(db, deviceId, Date.now())
  return { ok: true, total: rows.length, accepted: totalAccepted, conflicts: totalConflicts }
}

module.exports = { pushAllToServer }