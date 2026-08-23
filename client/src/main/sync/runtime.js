let daemon = null
function set(d) { daemon = d }
function get() { return daemon }
function triggerPush() { if (daemon && daemon.schedulePush) daemon.schedulePush() }
module.exports = { set, get, triggerPush }