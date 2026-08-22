const api = window.quickbrain

const els = {
  search: document.getElementById('search-input'),
  list: document.getElementById('note-list'),
  stats: document.getElementById('stats'),
  status: document.getElementById('status'),
  filters: document.getElementById('filters'),
  addBtn: document.getElementById('add-btn'),
  aiBtn: document.getElementById('ai-btn'),
  settingsBtn: document.getElementById('settings-btn'),
  modal: document.getElementById('add-modal'),
  modalContent: document.getElementById('modal-content'),
  modalCategory: document.getElementById('modal-category'),
  modalSave: document.getElementById('modal-save'),
  modalCancel: document.getElementById('modal-cancel')
}

let allNotes = []
let currentSearch = ''
let currentCategory = 'all'

async function loadNotes() {
  setStatus('加载中...')
  try {
    allNotes = await api.getAllNotes()
    setStatus('就绪')
  } catch (e) {
    setStatus('加载失败: ' + e.message)
    allNotes = []
  }
  render()
}

function getFiltered() {
  let r = allNotes
  if (currentCategory !== 'all') {
    r = r.filter(n => (n.category || '其他') === currentCategory)
  }
  if (currentSearch.trim()) {
    const q = currentSearch.toLowerCase()
    r = r.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.content || '').toLowerCase().includes(q) ||
      (n.tags || []).some(t => t.toLowerCase().includes(q))
    )
  }
  return r
}

function render() {
  const filtered = getFiltered()
  els.stats.textContent = filtered.length + ' / ' + allNotes.length + ' 条'

  if (allNotes.length === 0) {
    els.list.innerHTML =
      '<div class="empty">' +
        '<div class="icon">📝</div>' +
        '<div>还没有记录</div>' +
        '<div class="hint">按 <kbd>Ctrl</kbd>+<kbd>A</kbd> 或点击上方按钮添加</div>' +
      '</div>'
    return
  }

  if (filtered.length === 0) {
    els.list.innerHTML =
      '<div class="empty">' +
        '<div class="icon">🔍</div>' +
        '<div>没有符合的笔记</div>' +
        '<div class="hint">尝试清除筛选条件</div>' +
      '</div>'
    return
  }

  els.list.innerHTML = filtered.map(n => {
    const title = (n.title || '').trim() || '无标题'
    const content = (n.content || '').substring(0, 120)
    const cat = n.category || '其他'
    const tags = (n.tags || []).slice(0, 3)
    const date = formatDate(n.created_at)
    return (
      '<div class="note-card" data-id="' + n.id + '">' +
        '<div class="note-title">' + escapeHtml(title) + '</div>' +
        '<div class="note-content">' + escapeHtml(content) + '</div>' +
        '<div class="note-meta">' +
          '<span class="badge">' + escapeHtml(cat) + '</span>' +
          (tags.length ? tags.map(t => '<span class="badge">#' + escapeHtml(t) + '</span>').join('') : '') +
          '<span style="margin-left:auto">' + date + '</span>' +
        '</div>' +
      '</div>'
    )
  }).join('')

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
  try {
    const dt = new Date(d)
    const now = new Date()
    const diffMs = now - dt
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return '刚刚'
    if (diffMin < 60) return diffMin + ' 分钟前'
    if (diffMin < 1440) return Math.floor(diffMin / 60) + ' 小时前'
    if (diffMin < 43200) return Math.floor(diffMin / 1440) + ' 天前'
    return dt.toLocaleDateString('zh-CN')
  } catch { return d }
}

function setStatus(text) { els.status.textContent = text }

// ===== 添加笔记弹窗 =====
function showAddModal() {
  els.modalContent.value = ''
  els.modalCategory.value = currentCategory === 'all' ? '其他' : currentCategory
  els.modal.classList.add('show')
  setTimeout(() => els.modalContent.focus(), 50)
}

function hideAddModal() {
  els.modal.classList.remove('show')
}

async function saveModal() {
  const content = els.modalContent.value.trim()
  if (!content) {
    setStatus('内容不能为空')
    els.modalContent.focus()
    return
  }
  const title = content.split('\n')[0].trim().substring(0, 50) || '(无标题)'
  const category = els.modalCategory.value
  els.modalSave.disabled = true
  els.modalSave.textContent = '保存中...'
  try {
    await api.addNote({ content, title, category })
    hideAddModal()
    await loadNotes()
    setStatus('已添加')
  } catch (e) {
    setStatus('添加失败: ' + e.message)
  } finally {
    els.modalSave.disabled = false
    els.modalSave.textContent = '保存'
  }
}

els.addBtn.onclick = showAddModal
els.modalCancel.onclick = hideAddModal
els.modalSave.onclick = saveModal
els.modal.onclick = (e) => { if (e.target === els.modal) hideAddModal() }

// 弹窗内键盘: Esc 关闭, Ctrl+Enter 保存
els.modal.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); hideAddModal() }
  else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); saveModal() }
})

// ===== 搜索 & 筛选 =====
let searchTimer = null
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    currentSearch = els.search.value
    render()
  }, 200)
})

els.filters.addEventListener('click', (e) => {
  const chip = e.target.closest('.filter-chip')
  if (!chip) return
  els.filters.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'))
  chip.classList.add('active')
  currentCategory = chip.dataset.cat
  render()
})

els.aiBtn.onclick = () => {
  api.notify({ title: 'AI 格式化', body: '请使用 Ctrl+K 唤起命令面板，输入 "ai 摘要 关键字" 使用' })
}

els.settingsBtn.onclick = () => {
  api.notify({ title: '设置', body: '设置功能开发中' })
}

async function editNote(note) {
  // 简化: 用 prompt (虽然 contextIsolation 下 disabled, 主进程可走 IPC 弹窗; 暂留 TODO)
  const newContent = window.prompt('编辑内容:', note.content)
  if (newContent === null) return
  try {
    await api.updateNote({ id: note.id, content: newContent, title: newContent.split('\n')[0].trim().substring(0, 50) || '(无标题)' })
    await loadNotes()
    setStatus('已更新')
  } catch (e) {
    setStatus('更新失败: ' + e.message)
  }
}

// ===== 主进程事件 =====
if (api.onLocateNote) {
  api.onLocateNote((id) => {
    const note = allNotes.find(n => n.id === id)
    if (note) {
      currentSearch = note.title || note.content.substring(0, 20)
      els.search.value = currentSearch
      currentCategory = 'all'
      els.filters.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.cat === 'all'))
      render()
      setStatus('定位到笔记 #' + id)
    }
  })
}

if (api.onShowAddDialog) {
  api.onShowAddDialog(() => {
    showAddModal()
  })
}

loadNotes()
