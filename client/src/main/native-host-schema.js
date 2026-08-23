function parseMessage(line) {
  const trimmed = line.trim()
  if (!trimmed) return null
  let msg
  try { msg = JSON.parse(trimmed) } catch (e) { return { error: 'invalid-json' } }
  if (!msg || typeof msg !== 'object' || !msg.type) return { error: 'missing-type' }
  if (!['save-selection', 'save-page', 'ping'].includes(msg.type)) return { error: 'unknown-type' }
  return { msg }
}

module.exports = { parseMessage }
