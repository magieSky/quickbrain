const fs = require('fs')
const path = require('path')

const DIR = path.join(__dirname)

function readMigrations() {
  return fs.readdirSync(DIR)
    .filter(f => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map(f => ({ name: f, sql: fs.readFileSync(path.join(DIR, f), 'utf8') }))
}

function applyAll(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`)
  const applied = new Set(db.prepare('SELECT version FROM schema_version').all().map(r => r.version))
  for (const m of readMigrations()) {
    const version = parseInt(m.name.split('_')[0], 10)
    if (applied.has(version)) continue
    db.transaction(() => {
      db.exec(m.sql)
      db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(version, Date.now())
    })()
  }
}

function _forTesting_useThisModule() { return { readMigrations, applyAll } }

module.exports = { readMigrations, applyAll }
module.exports.default = _forTesting_useThisModule