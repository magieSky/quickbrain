const MAX_CONTENT_CHARS = 8000

function buildExtractPrompt(title, content) {
  const truncated = (content || '').slice(0, MAX_CONTENT_CHARS)
  return {
    system: 'You are a note-extraction assistant. Given a document, extract 3-7 independent key points. Each atom must be a self-contained statement that can be searched independently. Return only a JSON array, no other text.',
    user:
      'Document title: ' + (title || '(untitled)') + '\n' +
      'Document content:\n' + truncated + '\n---\n' +
      'Return JSON array:\n' +
      '[{"title":"5-15 chars summary","content":"1-3 sentences expressing the point","source_range":{"start":<int>,"end":<int>}}]\n' +
      'Note: source_range character indices are based on the Document content string above.'
  }
}

function parseAtomJson(raw) {
  if (!raw) return []
  let s = String(raw).trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  let arr
  try { arr = JSON.parse(s) } catch (_) {
    const m = s.match(/\[[\s\S]*\]/)
    if (!m) return []
    try { arr = JSON.parse(m[0]) } catch (_) { return [] }
  }
  if (!Array.isArray(arr)) return []
  return arr
    .filter(a => a && typeof a.title === 'string' && typeof a.content === 'string')
    .map(a => ({
      title: a.title.trim().slice(0, 100),
      content: a.content.trim().slice(0, 500),
      source_range: (a.source_range && typeof a.source_range === 'object')
        ? { start: Number(a.source_range.start) || 0, end: Number(a.source_range.end) || 0 }
        : { start: 0, end: 0 }
    }))
}

module.exports = { buildExtractPrompt, parseAtomJson, MAX_CONTENT_CHARS }