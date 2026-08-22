const params = new URLSearchParams(location.search)
const noteId = parseInt(params.get('id'), 10)
const api = window.paletteAPI

let currentNote = null

async function load() {
  currentNote = await api.getNote(noteId)
  if (!currentNote) {
    document.getElementById('title').textContent = '未找到'
    return
  }
  document.getElementById('title').textContent = currentNote.title || '(无标题)'
  document.getElementById('meta').textContent = `分类: ${currentNote.category || '其他'} · ${currentNote.created_at || ''}`
  document.getElementById('content').textContent = currentNote.content
  if (currentNote.source_path) {
    const info = document.getElementById('source-info')
    document.getElementById('source-path').textContent = currentNote.source_path
    info.style.display = 'block'
    document.getElementById('reveal-btn').onclick = async () => {
      const r = await api.revealInFolder(currentNote.source_path)
      if (!r.success) alert('打开失败: ' + (r.error || ''))
    }
  }
}

document.getElementById('copy-btn').onclick = async () => {
  if (!currentNote) return
  await api.writeClipboard(currentNote.content)
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
