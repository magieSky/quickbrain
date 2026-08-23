async function extractAtomsForSource(db, sourceClientId, { aiService, force = false } = {}) {
  if (!db) throw new Error('db required')
  if (!sourceClientId) throw new Error('sourceClientId required')

  const source = await db.selectFrom('notes').selectAll()
    .where('client_id', '=', sourceClientId).executeTakeFirst()
  if (!source) return { ok: false, error: 'not-found' }

  if (!force && source.extracted_at && source.extracted_at !== -1) {
    return { ok: true, skipped: true }
  }
  if (!aiService) {
    await db.updateTable('notes').set({ extracted_at: -1 })
      .where('client_id', '=', sourceClientId).executeTakeFirst()
    return { ok: false, error: 'ai-not-configured' }
  }

  let atoms
  try {
    atoms = await aiService.extractAtoms({
      title: source.title || '',
      content: source.content || ''
    })
  } catch (e) {
    await db.updateTable('notes').set({ extracted_at: -1 })
      .where('client_id', '=', sourceClientId).executeTakeFirst()
    return { ok: false, error: e.message }
  }
  if (!Array.isArray(atoms)) atoms = []

  if (force) {
    await db.deleteFrom('notes').where('parent_id', '=', sourceClientId).executeTakeFirst()
  }

  let count = 0
  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i] || {}
    const atomClientId = sourceClientId + ':atom:' + i
    const values = {
      client_id: atomClientId,
      content: atom.content || '',
      title: atom.title || '',
      category: source.category || 'uncategorized',
      tags: source.tags || '[]',
      is_formatted: 0,
      original_content: '',
      source_path: source.source_path || '',
      source_type: source.source_type || '',
      parent_id: sourceClientId,
      source_range: typeof atom.source_range === 'string' ? atom.source_range : JSON.stringify(atom.source_range || {}),
      is_atom: 1,
      extracted_at: null,
      created_at: source.created_at || source.updated_at || Date.now(),
      updated_at: Date.now(),
      deleted_at: null,
      rev: 1
    }
    try {
      await db.insertInto('notes').values(values)
        .onConflict(oc => oc.column('client_id').doUpdateSet(values))
        .executeTakeFirst()
      count++
    } catch (e) {
      console.error('[extractor] atom insert failed', e.message)
    }
  }

  const stamp = Date.now()
  await db.updateTable('notes').set({ extracted_at: stamp })
    .where('client_id', '=', sourceClientId).executeTakeFirst()

  return { ok: true, count }
}

module.exports = { extractAtomsForSource }