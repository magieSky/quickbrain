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

  return { start, stop, schedulePush, tickPull, _hasPullTimer: () => !!pullTimer, _hasPushTimer: () => !!pushTimer }
}

module.exports = { createDaemon }