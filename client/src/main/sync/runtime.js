let daemon = null
function set(d) { daemon = d }
function get() { return daemon }
function triggerPush() { if (daemon && daemon.schedulePush) daemon.schedulePush() }
function triggerPushNow() { if (daemon && daemon.triggerPushNow) return daemon.triggerPushNow(); return Promise.resolve({ skipped: 'no-daemon' }) }
function triggerPullNow() { if (daemon && daemon.triggerPullNow) return daemon.triggerPullNow(); return Promise.resolve({ skipped: 'no-daemon' }) }
module.exports = { set, get, triggerPush, triggerPushNow, triggerPullNow }