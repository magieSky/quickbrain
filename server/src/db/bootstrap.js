/**
 * SaaS-only bootstrap helpers. No more BYOS owner auto-seed.
 *
 * First-time deploy: server runs schema migrations (caller's job), then the
 * operator calls POST /v1/auth/register-admin with the ADMIN_BOOTSTRAP_TOKEN.
 * That endpoint uses `assertNotAlreadyBootstrapped` to refuse if any user
 * already exists.
 */

async function hasAnyUser(db) {
  const row = await db.selectFrom('users').select(eb => eb.fn.count('id').as('c')).executeTakeFirst()
  return !!row && Number(row.c) > 0
}

async function assertNotAlreadyBootstrapped(db) {
  if (await hasAnyUser(db)) {
    const err = new Error('already-bootstrapped')
    err.code = 'ALREADY_BOOTSTRAPPED'
    throw err
  }
}

/**
 * After the first user exists, enforce NOT NULL on notes.user_id.
 * Idempotent.
 */
async function enforceNotesUserNotNull(db) {
  try {
    await db.schema.alterTable('notes').alterColumn('user_id', col => col.setNotNull()).execute()
  } catch (e) {
    if (!/already (has|is not)?\s*not null/i.test(e.message)) throw e
  }
}

module.exports = { hasAnyUser, assertNotAlreadyBootstrapped, enforceNotesUserNotNull }
