const params = new URLSearchParams(location.search)
const noteId = parseInt(params.get('id'), 10)
const api = window.paletteAPI

let currentNote = null

async function load() {
  const all = await api.searchNotes('')
  currentNote = all.find(n => n.id === noteId)
  if (!currentNote) {
    document.getElementById('title').textContent = '未找到'
    return
  }
  document.getElementById('title').textContent = currentNote.title || '(无标题)'
  document.getElementById('meta').textContent = `分类: ${currentNote.category || '其他'} · ${currentNote.created_at || ''}`
  document.getElementById('content').textContent = currentNote.content
}

document.getElementById('copy-btn').onclick = async () => {
  if (!currentNote) return
  const { clipboard } = require('electron')
  clipboard.writeText(currentNote.content)
  document.getElementById('copy-btn').textContent = '已复制 ✓'
}

document.getElementById('ai-btn').onclick = async () => {
  if (!currentNote) return
  document.getElementById('ai-btn').textContent = '格式化中…'
  const r = await api.formatWithAI({ content: currentNote.content, style: 'summary' })
  if (r.success) {
    await api.updateNote({ id: currentNote.id, content: r.formattedContent, is_formatted: 1 })
    document.getElementById('content').textContent = r.formattedContent
    document.getElementById('ai-btn').textContent = '已格式化 ✓'
  } else {
    document.getElementById('ai-btn').textContent = '失败'
  }
}

document.getElementById('close-btn').onclick = () => window.close()

load()
