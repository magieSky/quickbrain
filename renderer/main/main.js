const api = window.quickbrain

const els = {
  search: document.getElementById('search-input'),
  list: document.getElementById('note-list'),
  status: document.getElementById('status'),
  addBtn: document.getElementById('add-btn'),
  aiBtn: document.getElementById('ai-btn'),
  settingsBtn: document.getElementById('settings-btn')
}

let allNotes = []
let currentSearch = ''

async function loadNotes() {
  setStatus('加载中...')
  try {
    if (currentSearch.trim()) {
      const results = await api.searchNotes({ search: currentSearch })
      allNotes = results
    } else {
      allNotes = await api.getAllNotes()
    }
    render()
    setStatus(\`已加载 \${allNotes.length} 条笔记\`)
  } catch (e) {
    setStatus('加载失败: ' + e.message)
  }
}

function render() {
  if (allNotes.length === 0) {
    els.list.innerHTML = '<div class="empty">还没有记录<br>按 Alt+K 唤起命令面板添加</div>'
    return
  }
  els.list.innerHTML = allNotes.map(n => \`
    <div class="note-card" data-id="\${n.id}">
      <div class="note-title">\${escapeHtml(n.title || '(无标题)')}</div>
      <div class="note-content">\${escapeHtml((n.content || '').substring(0, 200))}</div>
      <div class="note-meta">分类: \${escapeHtml(n.category || '其他')} | \${formatDate(n.created_at)}</div>
    </div>
  \`).join('')
  els.list.querySelectorAll('.note-card').forEach(card => {
    card.onclick = () => {
      const id = parseInt(card.dataset.id, 10)
      const note = allNotes.find(n => n.id === id)
      if (note) editNote(note)
    }
  })
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function formatDate(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleString('zh-CN') } catch { return d }
}

function setStatus(text) { els.status.textContent = text }

let searchTimer = null
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    currentSearch = els.search.value
    loadNotes()
  }, 200)
})

els.addBtn.onclick = () => {
  const content = prompt('输入笔记内容:')
  if (!content) return
  api.addNote({ content, title: extractTitle(content), category: '其他' })
    .then(() => loadNotes())
    .catch(e => setStatus('添加失败: ' + e.message))
}

els.aiBtn.onclick = () => {
  alert('请在命令面板 (Alt+K) 中使用 AI 格式化')
}

els.settingsBtn.onclick = () => {
  alert('设置功能开发中')
}

function extractTitle(text) {
  return (text || '').split('\n')[0].trim().substring(0, 50) || '(无标题)'
}

async function editNote(note) {
  const newContent = prompt('编辑内容:', note.content)
  if (newContent === null) return
  await api.updateNote({ id: note.id, content: newContent, title: extractTitle(newContent) })
  loadNotes()
}

// Listen for locate-note from palette
if (api.onLocateNote) {
  api.onLocateNote((id) => {
    const note = allNotes.find(n => n.id === id)
    if (note) {
      els.search.value = note.title || note.content.substring(0, 30)
      currentSearch = els.search.value
      loadNotes()
      setStatus(\`定位到笔记 #\${id}: \${note.title || '(无标题)'}\`)
    }
  })
}

loadNotes()
