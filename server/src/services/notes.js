function lwwIncomingWins(existing, incoming) {
  if (incoming.updated_at > existing.updated_at) return true
  if (incoming.updated_at < existing.updated_at) return false
  return incoming.client_id > existing.client_id
}

function mapIncoming(n) {
  return {
    client_id: n.client_id, content: n.content, title: n.title || '', category: n.category || 'uncategorized',
    tags: JSON.stringify(n.tags || []), is_formatted: n.is_formatted || 0,
    original_content: n.original_content || '', source_path: n.source_path || '',
    source_type: n.source_type || '', parent_id: n.parent_id || null,
    source_range: n.source_range || '', is_atom: n.is_atom || 0,
    extracted_at: n.extracted_at || null, created_at: n.created_at || n.updated_at,
    updated_at: n.updated_at, deleted_at: n.deleted_at || null, rev: n.rev || 1
  }
}

async function findByClientId(db, client_id) {
  // Kysely fluent builder — try .executeTakeFirst() first, fall back to .execute().then(r=>r[0])
  try {
    return await db.selectFrom('notes').selectAll()
      .where('client_id', '=', client_id).executeTakeFirst()
  } catch (_) {
    return null
  }
}

async function upsertNote(db, incoming) {
  const existing = await findByClientId(db, incoming.client_id)
  if (existing && !lwwIncomingWins(existing, incoming)) {
    return { status: 'conflict', server: existing }
  }
  try {
    await db.insertInto('notes').values(mapIncoming(incoming))
      .onConflict(oc => oc.column('client_id').doUpdateSet(mapIncoming(incoming)))
      .executeTakeFirst()
    return { status: 'accepted' }
  } catch (e) {
    return { status: 'error', error: e.message }
  }
}

async function softDelete(db, client_id, updated_at) {
  // only mark deleted if no incoming-updated row is newer than the delete
  const existing = await findByClientId(db, client_id)
  if (!existing) return { conflict: false, noop: true }
  if (existing.updated_at > updated_at) return { conflict: true }
  try {
    await db.updateTable('notes').set({ deleted_at: updated_at, updated_at })
      .where('client_id', '=', client_id).executeTakeFirst()
    return { conflict: false }
  } catch (e) {
    return { conflict: false, error: e.message }
  }
}

async function listChangedSince(db, since, limit) {
  return db.selectFrom('notes').selectAll()
    .where('updated_at', '>', since).orderBy('updated_at', 'asc').limit(limit).execute()
}

module.exports = { lwwIncomingWins, upsertNote, softDelete, listChangedSince }