#!/usr/bin/env node
;(async () => {
  const { loadConfig } = require('../src/config')
  const { createPool } = require('../src/db/pool')
  const { applyAll } = require('@quickbrain/shared/schema/pg/migrations')
  loadConfig()
  const db = createPool()
  await applyAll(db)
  console.log('pg migrations applied')
  await db.destroy()
})().catch(e => { console.error(e); process.exit(1) })