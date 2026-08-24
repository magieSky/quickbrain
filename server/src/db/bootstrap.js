const bcrypt = require('bcryptjs')

/**
 * Ensure the default owner user exists with secret = process.env.OWNER_TOKEN
 * and password = "changeme" (force change recommended).
 * Also backfills any notes.user_id NULL rows to the owner.
 */
async function ensureOwnerUser(db) {
  const existing = await db.selectFrom('users')
    .selectAll().where('username', '=', 'owner').executeTakeFirst()
  if (existing) {
    // backfill any orphans just in case
    const r = await db.updateTable('notes')
      .set({ user_id: existing.id })
      .where('user_id', 'is', null).execute()
    if (r && r.length) {
      console.log('[bootstrap] backfilled ' + r.length + ' orphan notes to owner #' + existing.id)
    }
    return existing
  }
  const ownerToken = process.env.OWNER_TOKEN
  if (!ownerToken) {
    console.warn('[bootstrap] OWNER_TOKEN not set; skipping owner seed')
    return null
  }
  const now = Date.now()
  const passwordHash = bcrypt.hashSync('changeme', 10)
  const inserted = await db.insertInto('users')
    .values({
      username: 'owner',
      password_hash: passwordHash,
      secret: ownerToken,
      is_owner: 1,
      created_at: now,
      updated_at: now
    })
    .returningAll()
    .executeTakeFirst()
  // Assign all existing notes (user_id IS NULL) to the owner
  await db.updateTable('notes')
    .set({ user_id: inserted.id })
    .where('user_id', 'is', null)
    .execute()
  console.log('[bootstrap] seeded owner user id=' + inserted.id +
    ' (username=owner password=changeme secret=*** — please change password)')
  return inserted
}

/**
 * After owner exists, enforce NOT NULL on notes.user_id.
 * Idempotent.
 */
async function enforceNotesUserNotNull(db) {
  try {
    await db.schema.alterTable('notes').alterColumn('user_id', col => col.setNotNull()).execute()
  } catch (e) {
    if (!/already (has|is not)?\s*not null/i.test(e.message)) throw e
  }
}

module.exports = { ensureOwnerUser, enforceNotesUserNotNull }
