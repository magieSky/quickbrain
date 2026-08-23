const fs = require('fs')
const path = require('path')

const DIR = path.join(__dirname)

function readMigrations() {
  return fs.readdirSync(DIR)
    .filter(f => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map(name => ({ name, sql: fs.readFileSync(path.join(DIR, name), 'utf8') }))
}

async function applyAll(pool) {
  const client = await pool.connect()
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at BIGINT NOT NULL)')
    const { rows } = await client.query('SELECT version FROM schema_version')
    const applied = new Set(rows.map(r => r.version))
    for (const m of readMigrations()) {
      const version = parseInt(m.name.split('_')[0], 10)
      if (applied.has(version)) continue
      await client.query('BEGIN')
      try {
        await client.query(m.sql)
        await client.query('INSERT INTO schema_version (version, applied_at) VALUES ($1, $2)', [version, Date.now()])
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      }
    }
  } finally {
    client.release()
  }
}

module.exports = { readMigrations, applyAll }