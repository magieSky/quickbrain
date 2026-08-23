function recordSeen(db, { deviceId, name, platform, clientVer }) {
  const now = Date.now()
  return db
    .insertInto('devices')
    .values({ device_id: deviceId, name, platform, client_ver: clientVer, last_seen: now, created_at: now })
    .onConflict(oc => oc.column('device_id').doUpdateSet({ last_seen: now, name, platform, client_ver: clientVer }))
    .executeTakeFirst()
}

function listDevices(db) {
  return db.selectFrom('devices').selectAll().orderBy('last_seen', 'desc').execute()
}

function revoke(db, deviceId) {
  return db.updateTable('devices').set({ revoked_at: Date.now() }).where('device_id', '=', deviceId).executeTakeFirst()
}

module.exports = { recordSeen, listDevices, revoke }