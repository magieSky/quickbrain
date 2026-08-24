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
  aiServerUrl: document.getElementById('ai-server-url'),
  aiServerToken: document.getElementById('ai-server-token'),
  aiToggleServerToken: document.getElementById('ai-toggle-server-token'),
  modalContent: document.getElementById('modal-content'),
  modalCategory: document.getElementById('modal-category'),
  modalSave: document.getElementById('modal-save'),
  modalCancel: document.getElementById('modal-cancel'),
  importBtn: document.getElementById('import-btn'),
  importFile: document.getElementById('import-file'),
  dropOverlay: document.getElementById('drop-overlay'),
  syncModal: document.getElementById('sync-modal'),
  syncStatusBox: document.getElementById('sync-status-box'),
  syncStatusLine: document.getElementById('sync-status-line'),
  syncDisconnect: document.getElementById('sync-disconnect'),
  syncTabSignup: document.getElementById('sync-tab-signup'),
  syncTabSignin: document.getElementById('sync-tab-signin'),
  syncPaneSignup: document.getElementById('sync-pane-signup'),
  syncPaneSignin: document.getElementById('sync-pane-signin'),
  syncServerUrl: document.getElementById('sync-server-url'),
  syncUsername: document.getElementById('sync-username'),
  syncPassword: document.getElementById('sync-password'),
  syncTokenServerUrl: document.getElementById('sync-token-server-url'),
  syncToken: document.getElementById('sync-token'),
  syncFeedbackSignup: document.getElementById('sync-feedback-signup'),
  syncFeedbackSignin: document.getElementById('sync-feedback-signin'),
  syncCancel: document.getElementById('sync-cancel'),
  syncSubmitSignup: document.getElementById('sync-submit-signup'),
  syncSubmitSignin: document.getElementById('sync-submit-signin'),
  syncOpenAiSettings: document.getElementById('sync-open-ai-settings')
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

// Map server / network error codes to friendly Chinese text. Anything we
// do not recognise falls through to the raw string so we never hide useful
// debugging information from the user.
const SYNC_ERROR_MESSAGES = {
  'invalid-username': '用户名不合法（仅支持字母、数字、下划线和连字符）',
  'invalid-password': '密码不合法（至少 6 个字符）',
  'username-taken': '该用户名已被占用',
  'invalid-credentials': '用户名或密码错误',
  'wrong-password': '旧密码错误',
  'no-such-user': '用户不存在',
  'missing-fields': '缺少必填项',
  'missing-server-url': '缺少服务器地址',
  'missing-token': '缺少登录令牌',
  'unauthorized': '未授权，令牌无效或已过期',
  'invalid-response': '服务器响应无效',
  'network-error': '无法连接服务器，请检查网络或服务器地址',
  'bootstrap-disabled': '服务器未开启管理员注册通道',
  'invalid-bootstrap-token': '服务器拒绝了这次注册请求',
  'already-bootstrapped': '服务器已经初始化过，不能再注册管理员账号'
}

function translateSyncError(err) {
  if (!err) return '未知错误'
  const code = String(err).split(':')[0].trim()
  if (SYNC_ERROR_MESSAGES[code]) return SYNC_ERROR_MESSAGES[code]
  if (/^network-error/.test(err)) return '网络错误：' + String(err).slice('network-error:'.length).trim()
  if (/^invalid-response/.test(err)) return '服务器响应无效：' + String(err).slice('invalid-response:'.length).trim()
  if (/^http-/.test(err)) return '服务器返回 HTTP ' + err.slice(5) + '，请稍后重试'
  return err
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

els.aiBtn.onclick = () => openAISettings()

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


let aiProviders = []
let aiSelectedProvider = null
let aiCurrentConfig = {}

async function openAISettings() {
  els.aiModal.classList.add('show')
  els.aiStatus.className = 'ai-status'
  els.aiStatus.textContent = ''
  try {
    aiProviders = await api.getProviders()
    aiCurrentConfig = await api.getAIConfig()
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
  els.aiServerUrl.value = aiCurrentConfig.serverUrl || ''
  els.aiServerToken.value = ''
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
  const serverUrl = els.aiServerUrl.value.trim()
  const serverToken = els.aiServerToken.value.trim()
  cfg.serverUrl = serverUrl || null
  cfg.serverToken = serverToken ? (serverToken === (aiCurrentConfig.serverTokenPreview || '') ? '__KEEP__' : serverToken) : null
  return cfg
}

els.aiToggleKey.onclick = () => {
  els.aiApiKey.type = els.aiApiKey.type === 'password' ? 'text' : 'password'
}

els.aiToggleServerToken.onclick = () => {
  els.aiServerToken.type = els.aiServerToken.type === 'password' ? 'text' : 'password'
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
  if (cfg.serverToken === '__KEEP__') cfg.serverToken = ''
  els.aiSave.disabled = true
  try {
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
// ---- Sync / Server Settings modal ----

async function openSyncSettings() {
  els.syncFeedbackSignup.className = 'sync-feedback'
  els.syncFeedbackSignup.textContent = ''
  els.syncFeedbackSignin.className = 'sync-feedback'
  els.syncFeedbackSignin.textContent = ''
  els.syncModal.classList.add('show')
  switchSyncTab('signup')
  await refreshSyncStatus()
}

function closeSyncSettings() {
  els.syncModal.classList.remove('show')
}

async function refreshSyncStatus() {
  let c
  try {
    c = await api.getSyncConfig()
  } catch (e) {
    els.syncStatusBox.className = 'sync-status disconnected'
    els.syncStatusLine.textContent = '同步配置不可用'
    els.syncDisconnect.style.display = 'none'
    return
  }
  // Always pre-fill both URL inputs so a fresh install opens Settings with
  // the bundled SaaS URL ready to go instead of two empty text boxes.
  if (c.serverUrl) {
    els.syncServerUrl.value = c.serverUrl
    els.syncTokenServerUrl.value = c.serverUrl
  } else {
    try {
      const d = await api.getDefaultSyncServerUrl()
      if (d && d.serverUrl) {
        els.syncServerUrl.value = d.serverUrl
        els.syncTokenServerUrl.value = d.serverUrl
      }
    } catch (_) { /* fall through to whatever the input HTML default is */ }
  }
  if (c.enabled && c.serverUrl && !c.serverUrlIsDefault) {
    els.syncStatusBox.className = 'sync-status connected'
    els.syncStatusLine.textContent = '已连接到 ' + c.serverUrl + (c.hasToken ? '（令牌已保存）' : '')
    els.syncDisconnect.style.display = ''
  } else {
    els.syncStatusBox.className = 'sync-status disconnected'
    els.syncStatusLine.textContent = c.serverUrlIsDefault
      ? '未连接。已预填默认服务器 - 注册账号或粘贴令牌即可连接。'
      : '未连接任何服务器'
    els.syncDisconnect.style.display = 'none'
  }
}

function switchSyncTab(name) {
  const isSignup = name === 'signup'
  els.syncTabSignup.classList.toggle('active', isSignup)
  els.syncTabSignin.classList.toggle('active', !isSignup)
  els.syncPaneSignup.style.display = isSignup ? '' : 'none'
  els.syncPaneSignin.style.display = isSignup ? 'none' : ''
  els.syncSubmitSignup.style.display = isSignup ? '' : 'none'
  els.syncSubmitSignin.style.display = isSignup ? 'none' : ''
}

function showSyncFeedback(el, msg, ok) {
  el.className = 'sync-feedback show ' + (ok ? 'success' : 'error')
  el.textContent = msg
}

els.syncTabSignup.onclick = () => switchSyncTab('signup')
els.syncTabSignin.onclick = () => switchSyncTab('signin')

els.syncCancel.onclick = closeSyncSettings
els.syncOpenAiSettings.onclick = (e) => { e.preventDefault(); closeSyncSettings(); openAISettings() }
els.syncModal.addEventListener('click', (e) => {
  if (e.target === els.syncModal) closeSyncSettings()
})

els.syncSubmitSignup.onclick = async () => {
  const serverUrl = els.syncServerUrl.value.trim()
  const username = els.syncUsername.value.trim()
  const password = els.syncPassword.value
  if (!serverUrl || !username || !password) {
    showSyncFeedback(els.syncFeedbackSignup, '服务器地址、用户名和密码都是必填项', false)
    return
  }
  els.syncSubmitSignup.disabled = true
  showSyncFeedback(els.syncFeedbackSignup, '正在创建账号...', true)
  try {
    const r = await api.registerWithServer({ serverUrl, username, password })
    if (r.ok) {
      showSyncFeedback(els.syncFeedbackSignup, '账号已创建并已连接为 ' + r.username, true)
      await refreshSyncStatus()
      setTimeout(closeSyncSettings, 1200)
    } else {
      showSyncFeedback(els.syncFeedbackSignup, '失败：' + translateSyncError(r.error), false)
    }
  } catch (e) {
    showSyncFeedback(els.syncFeedbackSignup, '网络错误：' + e.message, false)
  }
  els.syncSubmitSignup.disabled = false
}

els.syncSubmitSignin.onclick = async () => {
  const serverUrl = els.syncTokenServerUrl.value.trim()
  const token = els.syncToken.value.trim()
  if (!serverUrl || !token) {
    showSyncFeedback(els.syncFeedbackSignin, '服务器地址和令牌都是必填项', false)
    return
  }
  els.syncSubmitSignin.disabled = true
  showSyncFeedback(els.syncFeedbackSignin, '正在登录...', true)
  try {
    const r = await api.signInWithToken({ serverUrl, token })
    if (r.ok) {
      showSyncFeedback(els.syncFeedbackSignin, '已登录为 ' + (r.username || '用户'), true)
      await refreshSyncStatus()
      setTimeout(closeSyncSettings, 1200)
    } else {
      showSyncFeedback(els.syncFeedbackSignin, '失败：' + translateSyncError(r.error), false)
    }
  } catch (e) {
    showSyncFeedback(els.syncFeedbackSignin, '网络错误：' + e.message, false)
  }
  els.syncSubmitSignin.disabled = false
}

els.syncDisconnect.onclick = async () => {
  try {
    await api.setSyncConfig({ enabled: false })
    await refreshSyncStatus()
  } catch (e) {
    api.log('error', ['[sync-disconnect]', e.message])
  }
}

// Wire the settings (gear) button to open the sync modal.
els.settingsBtn.onclick = openSyncSettings


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

if (api.onOpenAISettings) {
  api.onOpenAISettings(() => {
    openAISettings()
  })
}

if (api.onShowAddDialog) {
  api.onShowAddDialog(() => {
    showAddModal()
  })
}

loadNotes()
