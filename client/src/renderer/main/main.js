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
  autoLaunchBtn: document.getElementById('auto-launch-btn'),
  modal: document.getElementById('add-modal'),
  aiModal: document.getElementById('ai-modal'),
  aiProviderList: document.getElementById('provider-list'),
  aiForm: document.getElementById('ai-form'),
  aiFormTitle: document.getElementById('ai-form-title'),
  aiApiKey: document.getElementById('ai-apikey'),
  aiToggleKey: document.getElementById('ai-toggle-key'),
  aiKeyHint: document.getElementById('ai-key-hint'),
  aiExtraRow: document.getElementById('ai-extra-row'),
  aiBaseURL: document.getElementById('ai-baseurl'),
  aiModel: document.getElementById('ai-model'),
  aiStatus: document.getElementById('ai-status'),
  aiCurrent: document.getElementById('ai-current'),
  aiCancel: document.getElementById('ai-cancel'),
  aiTest: document.getElementById('ai-test'),
  aiSave: document.getElementById('ai-save'),
  aiModeDirect: document.getElementById('ai-mode-direct'),
  aiModeServer: document.getElementById('ai-mode-server'),
  aiServerStatus: document.getElementById('ai-server-status'),
  modalContent: document.getElementById('modal-content'),
  modalCategory: document.getElementById('modal-category'),
  modalSave: document.getElementById('modal-save'),
  modalCancel: document.getElementById('modal-cancel'),
  importBtn: document.getElementById('import-btn'),
  importFile: document.getElementById('import-file'),
  dropOverlay: document.getElementById('drop-overlay')
}

let allNotes = []
let currentSearch = ''
let currentCategory = 'all'
let currentType = 'all' // 'all' | 'source' | 'atom'
let aiReady = false

async function loadNotes() {
  setStatus('加载中...')
  try {
    allNotes = await api.getAllNotes()
    try { const cfg = await api.getAIConfig(); aiReady = !!(cfg && cfg.provider && cfg.hasApiKey) } catch (_) {}
    setStatus('就绪')
  } catch (e) {
    setStatus('加载失败: ' + e.message)
    allNotes = []
  }
  render()
}


function parentTitleOf(n) {
  if (!n.parent_id) return '(unknown)'
  const p = allNotes.find(x => x.id === n.parent_id)
  return (p && p.title) || '(unknown)'
}
function getFiltered() {
  let r = allNotes
  if (currentType === 'source') r = r.filter(n => !n.is_atom)
  else if (currentType === 'atom') r = r.filter(n => n.is_atom)
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
  const sources = allNotes.filter(n => !n.is_atom).length; const atoms = allNotes.filter(n => n.is_atom).length; els.stats.textContent = sources + ' 源 / ' + atoms + ' 原子'

  if (allNotes.length === 0) {
    els.list.innerHTML =
      '<div class="empty">' +
        '<div class="icon">📝</div>' +
        '<div>还没有记录</div>' +
        '<div class="hint">按 <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd> 或点击上方按钮添加</div>' +
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
    const sourceBadge = (function () {
      if (!n.source_path) return ''
      const path = escapeHtml(n.source_path)
      const isWeb = n.source_type === 'web' || /^https?:\/\//i.test(n.source_path)
      const cls = isWeb ? 'note-source note-source-web' : 'note-source note-source-file'
      const label = isWeb ? '🔗 打开网页' : '📁 定位文件'
      const titleText = isWeb ? ('打开 ' + n.source_path) : ('定位 ' + n.source_path)
      return '<span class="' + cls + '" data-path="' + path + '" data-web="' + (isWeb ? '1' : '0') + '" title="' + escapeHtml(titleText) + '">' + label + '</span>'
    })()
    return (
      '<div class="note-card" data-id="' + n.id + '">' +
        '<div class="note-title">' + escapeHtml(title) + '</div>' +
        '<div class="note-content">' + renderMarkdown(content) + '</div>' +
        '<div class="note-meta">' +
          '<span class="badge">' + escapeHtml(cat) + '</span>' +
          (tags.length ? tags.map(t => '<span class="badge">#' + escapeHtml(t) + '</span>').join('') : '') +
          sourceBadge +
          '<span style="margin-left:auto">' + date + '</span>' +
          '<button class="note-card-act note-card-edit" data-id="' + n.id + '" title="编辑">\u270F\uFE0F</button>' +
          '<button class="note-card-act note-card-format" data-id="' + n.id + '" title="AI 格式化">\u2728</button>' +
          '<button class="note-card-del" data-id="' + n.id + '" title="删除">\u{1F5D1}</button>' +
        '</div>' +
      '</div>'
    )
  }).join('')

  els.list.querySelectorAll('.note-card-edit').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const id = parseInt(btn.dataset.id, 10)
      const note = allNotes.find(n => n.id === id)
      if (note) editNote(note)
    }
  })
  els.list.querySelectorAll('.note-card-format').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation()
      const id = parseInt(btn.dataset.id, 10)
      await formatNoteInline(id)
    }
  })
  els.list.querySelectorAll('.note-source').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation()
      const p = el.dataset.path
      if (!p) return
      const isWeb = el.dataset.web === '1'
      const fn = isWeb ? api.openExternal(p) : api.revealInFolder(p)
      fn.then(r => {
        if (r && !r.success) setStatus('打开失败: ' + r.error)
      }).catch(err => setStatus('打开失败: ' + err.message))
    }
  })
  els.list.querySelectorAll('.source-status').forEach(el => {
    el.onclick = async (e) => {
      e.stopPropagation()
      const id = parseInt(el.dataset.id, 10)
      if (!id) return
      try { await api.extractSource(id, true); await loadNotes(); setStatus('重新抽取完成') }
      catch (err) { setStatus('抽取失败: ' + err.message) }
    }
  })
  els.list.querySelectorAll('.source-link').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation()
      const id = parseInt(el.dataset.id, 10)
      if (id) api.revealSource(id)
    }
  })
  els.list.querySelectorAll('.note-card-del').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation()
      const id = parseInt(btn.dataset.id, 10)
      const note = allNotes.find(n => n.id === id)
      if (!note) return
      const title = ((note.title || note.content || '').split('\n')[0] || '').substring(0, 30) || '(无标题)'
      if (!window.confirm('删除笔记:\n\n' + title + '\n\n确定?')) return
      try {
        await api.deleteNote(id)
        await loadNotes()
        setStatus('已删除')
      } catch (err) {
        setStatus('删除失败: ' + err.message)
      }
    }
  })
  els.list.querySelectorAll('.note-source').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation()
      const p = el.dataset.path
      if (!p) return
      const isWeb = el.dataset.web === '1'
      const fn = isWeb ? api.openExternal(p) : api.revealInFolder(p)
      fn.then(r => { if (r && !r.success) setStatus('打开失败: ' + r.error) }).catch(err => setStatus('打开失败: ' + err.message))
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


els.filters.querySelectorAll('.filter-chip').forEach(c => {
  if (c.dataset.type) {
    c.onclick = () => {
      currentType = c.dataset.type
      els.filters.querySelectorAll('.filter-chip').forEach(x => x.classList.toggle('active', x === c))
      render()
    }
  }
})

els.addBtn.onclick = showAddModal
els.modalCancel.onclick = hideAddModal
els.modalSave.onclick = saveModal
els.modal.onclick = (e) => { if (e.target === els.modal) hideAddModal() }

// ===== 导入文件 =====
async function importFile(filePath) {
  if (!filePath) return
  const name = filePath.split(/[\\\/]/).pop()
  setStatus('正在导入: ' + name + ' ...')
  try {
    const result = await api.importDocument(filePath)
    if (result.success) {
      setStatus('导入成功 #' + result.id + ' · ' + result.title)
      await loadNotes()
    } else {
      setStatus('导入失败: ' + result.error)
    }
  } catch (e) {
    setStatus('导入失败: ' + e.message)
  }
}

els.importBtn.onclick = () => { els.importFile.value = ''; els.importFile.click() }
els.importFile.onchange = async (e) => {
  const files = Array.from(e.target.files || [])
  for (const f of files) {
    const filePath = api.getPathForFile(f)
    if (filePath) await importFile(filePath)
  }
}

// 拖拽导入（整个主窗口为接收区）
let dragCounter = 0
window.addEventListener('dragenter', (e) => {
  e.preventDefault()
  if (!e.dataTransfer.types.includes('Files')) return
  dragCounter++
  els.dropOverlay.classList.add('active')
})
window.addEventListener('dragover', (e) => { e.preventDefault() })
window.addEventListener('dragleave', (e) => {
  e.preventDefault()
  dragCounter--
  if (dragCounter <= 0) { dragCounter = 0; els.dropOverlay.classList.remove('active') }
})
window.addEventListener('drop', async (e) => {
  e.preventDefault()
  dragCounter = 0
  els.dropOverlay.classList.remove('active')
  const files = Array.from(e.dataTransfer.files || [])
  for (const f of files) {
    const filePath = api.getPathForFile(f)
    if (filePath) await importFile(filePath)
  }
})

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

async function refreshAutoLaunch() {
  try {
    const on = await api.getAutoLaunch()
    els.autoLaunchBtn.title = '开机自启: ' + (on ? '开' : '关')
    els.autoLaunchBtn.classList.toggle('active', on)
  } catch (e) { /* ignore */ }
}

els.autoLaunchBtn.onclick = async () => {
  try {
    const on = await api.getAutoLaunch()
    const want = !on
    if (!window.confirm('当前开机自启：' + (on ? '已开启' : '已关闭') + '\n\n点确定即' + (want ? '开启' : '关闭') + '。')) return
    const r = await api.setAutoLaunch(want)
    if (r.success) {
      setStatus((want ? '✅ 已' : '❌ 已') + (want ? '开启' : '关闭') + '开机自启')
      refreshAutoLaunch()
    } else {
      setStatus('设置失败: ' + (r.error || '未知错误'))
    }
  } catch (e) {
    setStatus('操作失败: ' + e.message)
  }
}

refreshAutoLaunch()

els.settingsBtn.onclick = () => {
  openAISettings()
}

let aiProviders = []
let aiSelectedProvider = null
let aiCurrentConfig = {}

async function openAISettings() {
  els.aiModal.classList.add('show')
  els.aiStatus.className = 'ai-status'
  els.aiStatus.textContent = ''
  let aiModeInfo = { mode: 'direct', serverConfigured: false }
  try {
    aiProviders = await api.getProviders()
    aiCurrentConfig = await api.getAIConfig()
    aiModeInfo = await api.getAIMode()
  } catch (e) {
    api.log('error', ['[openAISettings]', e.message])
    return
  }
  if (aiCurrentConfig.provider && aiCurrentConfig.hasApiKey) {
    const p = aiProviders.find(x => x.id === aiCurrentConfig.provider)
    els.aiCurrent.textContent = '当前使用: ' + (p ? p.icon + ' ' + p.name : aiCurrentConfig.provider) + ' · ' + (aiCurrentConfig.model || '')
  } else {
    els.aiCurrent.textContent = '未配置 AI 服务'
  }
  els.aiModeDirect.checked = aiModeInfo.mode !== 'server'
  els.aiModeServer.checked = aiModeInfo.mode === 'server'
  if (aiModeInfo.serverConfigured) {
    els.aiServerStatus.textContent = 'Server configured. Server mode routes AI calls to /v1/ai/*.'
    els.aiServerStatus.style.color = 'rgba(126,217,154,0.85)'
  } else {
    els.aiServerStatus.textContent = 'Server NOT configured. Enable sync in Sync Settings first to use server mode.'
    els.aiServerStatus.style.color = 'rgba(255,180,120,0.7)'
  }
  renderProviders()
  const initial = aiCurrentConfig.provider || (aiProviders[0] && aiProviders[0].id)
  selectProvider(initial)
}

function renderProviders() {
  els.aiProviderList.innerHTML = ''
  aiProviders.forEach(p => {
    const div = document.createElement('div')
    div.className = 'provider-card'
    div.dataset.id = p.id
    div.innerHTML = '<span class="picon">' + p.icon + '</span><div class="pname">' + p.name + '</div><div class="pdesc">' + p.description + '</div>'
    div.onclick = () => selectProvider(p.id)
    els.aiProviderList.appendChild(div)
  })
}

function selectProvider(id) {
  aiSelectedProvider = id
  els.aiProviderList.querySelectorAll('.provider-card').forEach(c => c.classList.toggle('active', c.dataset.id === id))
  const p = aiProviders.find(x => x.id === id)
  if (!p) return
  els.aiForm.classList.add('show')
  els.aiFormTitle.textContent = p.requiresApiKey ? 'API Key' : 'API Key (可选)'
  els.aiKeyHint.innerHTML = p.keyHint + (p.keyUrl ? ' · <a href="#" id="key-link">去申请</a>' : '')
  if (p.keyUrl) {
    const link = document.getElementById('key-link')
    if (link) link.onclick = (e) => { e.preventDefault(); api.openExternal(p.keyUrl) }
  }
  if (p.customBaseURL || p.customModel) {
    els.aiExtraRow.style.display = 'flex'
    els.aiBaseURL.value = aiCurrentConfig.baseURL || p.baseURL || ''
    els.aiModel.value = aiCurrentConfig.model || p.defaultModel || ''
  } else {
    els.aiExtraRow.style.display = 'none'
  }
  els.aiApiKey.value = ''
  els.aiStatus.className = 'ai-status'
  els.aiStatus.textContent = ''
}

function showAIStatus(msg, ok) {
  els.aiStatus.className = 'ai-status show ' + (ok ? 'success' : 'error')
  els.aiStatus.textContent = msg
}

function buildConfigFromForm() {
  const cfg = {
    provider: aiSelectedProvider,
    apiKey: els.aiApiKey.value.trim() || (aiCurrentConfig.hasApiKey && aiCurrentConfig.provider === aiSelectedProvider ? '__KEEP__' : '')
  }
  const p = aiProviders.find(x => x.id === aiSelectedProvider)
  if (p && p.customBaseURL) cfg.baseURL = els.aiBaseURL.value.trim()
  if (p && p.customModel) cfg.model = els.aiModel.value.trim()
  else if (p) cfg.model = p.defaultModel
  return cfg
}

els.aiToggleKey.onclick = () => {
  els.aiApiKey.type = els.aiApiKey.type === 'password' ? 'text' : 'password'
}

els.aiTest.onclick = async () => {
  const cfg = buildConfigFromForm()
  if (cfg.apiKey === '__KEEP__') cfg.apiKey = ''  // 测试时不能保留，让服务器报错
  els.aiTest.disabled = true
  showAIStatus('测试中...', true)
  try {
    const r = await api.testAIConnection(cfg)
    if (r.success) showAIStatus('✅ ' + (r.message || '连接成功'), true)
    else showAIStatus('❌ ' + (r.error || '连接失败'), false)
  } catch (e) {
    showAIStatus('❌ ' + e.message, false)
  }
  els.aiTest.disabled = false
}

els.aiSave.onclick = async () => {
  const cfg = buildConfigFromForm()
  if (cfg.apiKey === '__KEEP__') cfg.apiKey = ''  // 保存时也不传，让 main 保留原 key
  const aiMode = els.aiModeServer.checked ? 'server' : 'direct'
  els.aiSave.disabled = true
  try {
    const modeR = await api.setAIMode(aiMode)
    if (!modeR || !modeR.ok) {
      showAIStatus('❌ ' + ('设置 AI 模式失败' + (modeR && modeR.error ? ': ' + modeR.error : '')), false)
      els.aiSave.disabled = false
      return
    }
    const r = await api.saveAIConfig(cfg)
    if (r.success) {
      els.aiModal.classList.remove('show')
      loadNotes()
    } else {
      showAIStatus('❌ ' + (r.error || '保存失败'), false)
    }
  } catch (e) {
    showAIStatus('❌ ' + e.message, false)
  }
  els.aiSave.disabled = false
}

els.aiCancel.onclick = () => {
  els.aiModal.classList.remove('show')
}

els.aiModal.addEventListener('click', (e) => {
  if (e.target === els.aiModal) els.aiModal.classList.remove('show')
})

async function formatNoteInline(id) {
  const note = allNotes.find(n => n.id === id)
  if (!note) return
  const style = await promptModal(
    '选择格式化方式（输入数字）:\n1-摘要整理\n2-结构化输出\n3-标签分类\n4-思维导图',
    '1',
    { multiline: false }
  )
  if (!style) return
  const styleMap = { '1': 'summary', '2': 'structured', '3': 'tags', '4': 'mindmap' }
  const selected = styleMap[style.trim()] || 'summary'
  try {
    setStatus('AI 格式化中...')
    const result = await api.formatWithAI({ content: note.content, style: selected })
    if (!result || !result.success) { setStatus('格式化失败: ' + (result && result.error || '空结果')); return }
    const body = result.formattedContent || result.content || ''
    if (!body) { setStatus('格式化失败：空结果'); return }
    await api.updateNote({ id: note.id, content: body, title: body.split('\n')[0].trim().substring(0, 50) || note.title })
    await loadNotes()
    setStatus('已格式化')
  } catch (e) {
    setStatus('格式化失败: ' + e.message)
  }
}

async function editNote(note) {
  const newContent = await promptModal('编辑内容:', note.content, { multiline: true })
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

if (api.onNotesUpdated) {
  api.onNotesUpdated(() => {
    loadNotes()
  })
}

if (api.onLocateNote) {
  api.onLocateNote(({ id, range }) => {
    const note = allNotes.find(n => n.id === id)
    if (!note) return
    currentSearch = note.title || note.content.substring(0, 20)
    els.search.value = currentSearch
    currentCategory = 'all'
    currentType = note.is_atom ? 'atom' : 'source'
    els.filters.querySelectorAll('.filter-chip').forEach(c => {
      const isActive = (c.dataset.type && c.dataset.type === currentType) ||
                        (!c.dataset.type && c.dataset.cat === 'all')
      c.classList.toggle('active', isActive)
    })
    render()
    if (range && range.start != null) {
      const snippet = note.content.slice(range.start, range.end)
      window.alert('源笔记 #' + note.id + '\n\n[' + range.start + '-' + range.end + ']:\n' + snippet)
    } else {
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
