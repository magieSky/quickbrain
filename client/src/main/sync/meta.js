function ensure(db, deviceId) {
  db.prepare('INSERT OR IGNORE INTO sync_meta (device_id) VALUES (?)').run(deviceId)
}

function get(db, deviceId) {
  return db.prepare('SELECT * FROM sync_meta WHERE device_id = ?').get(deviceId)
}

function setCursor(db, deviceId, cursor) {
  db.prepare('UPDATE sync_meta SET last_pull_cursor = ? WHERE device_id = ?').run(cursor, deviceId)
}

function setLastPushAt(db, deviceId, ts) {
  db.prepare('UPDATE sync_meta SET last_push_at = ? WHERE device_id = ?').run(ts, deviceId)
}

function nextOutboxSeq(db, deviceId) {
  const row = db.prepare('SELECT outbox_seq FROM sync_meta WHERE device_id = ?').get(deviceId)
  const next = (row ? row.outbox_seq : 0) + 1
  db.prepare('UPDATE sync_meta SET outbox_seq = ? WHERE device_id = ?').run(next, deviceId)
  return next
}

module.exports = { ensure, get, setCursor, setLastPushAt, nextOutboxSeq }