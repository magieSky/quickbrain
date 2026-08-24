function createDaemon({ getConfig, intervalMs = 5000, debounceMs = 1000, onPull, onPush }) {
  let pullTimer = null
  let pushTimer = null
  let running = false

  async function tickPull() {
    const cfg = getConfig()
    if (!cfg.enabled) return
    try { await onPull() } catch (e) { console.error('[sync] pull failed:', e.message) }
  }

  function schedulePush() {
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(async () => {
      pushTimer = null
      const cfg = getConfig()
      if (!cfg.enabled) return
      try { await onPush() } catch (e) { console.error('[sync] push failed:', e.message) }
    }, debounceMs)
  }

  // Immediate push: kicks the daemon right after the debounce window so
  // callers (register / sign-in / disconnect) do not have to wait for the
  // next 5-second pull tick to flush the outbox.
  async function triggerPushNow() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null }
    const cfg = getConfig()
    if (!cfg.enabled) return { skipped: 'sync-disabled' }
    try { await onPush(); return { ok: true } } catch (e) { return { ok: false, error: e.message } }
  }

  // Immediate pull: used after register / sign-in so the user does not
  // wait up to intervalMs to see data that already lives on the server.
  async function triggerPullNow() {
    const cfg = getConfig()
    if (!cfg.enabled) return { skipped: 'sync-disabled' }
    try { await tickPull(); return { ok: true } } catch (e) { return { ok: false, error: e.message } }
  }

  function start() {
    if (running) return
    running = true
    if (pullTimer) clearInterval(pullTimer)
    pullTimer = setInterval(tickPull, intervalMs)
    setTimeout(tickPull, 0)
  }

  function stop() {
    running = false
    if (pullTimer) { clearInterval(pullTimer); pullTimer = null }
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null }
  }

  return { start, stop, schedulePush, triggerPushNow, triggerPullNow, tickPull, _hasPullTimer: () => !!pullTimer, _hasPushTimer: () => !!pushTimer }
}

module.exports = { createDaemon }