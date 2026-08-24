const fs = require('fs')
const path = require('path')

const DIR = path.join(__dirname)

function readMigrations() {
  return fs.readdirSync(DIR)
    .filter(f => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map(name => ({ name, sql: fs.readFileSync(path.join(DIR, name), 'utf8') }))
}

/**
 * Apply migrations using a Kysely instance.
 * Uses Kysely's transaction() + executeQuery for raw SQL.
 */
async function applyAll(db) {
  await db.schema
    .createTable('schema_version')
    .ifNotExists()
    .addColumn('version', 'integer', col => col.primaryKey())
    .addColumn('applied_at', 'bigint', col => col.notNull())
    .execute()
    .catch(() => { /* ignore "already exists" race */ })

  const existing = await db.selectFrom('schema_version').select('version').execute()
  const applied = new Set(existing.map(r => r.version))
  for (const m of readMigrations()) {
    const version = parseInt(m.name.split('_')[0], 10)
    if (applied.has(version)) continue
    await db.transaction().execute(async trx => {
      // Run the raw SQL via Kysely's executeQuery
      await trx.executeQuery({
        sql: m.sql,
        parameters: [],
        query: { kind: 'RawNode' }
      })
      await trx
        .insertInto('schema_version')
        .values({ version, applied_at: Date.now() })
        .execute()
    })
  }
}

module.exports = { readMigrations, applyAll }
