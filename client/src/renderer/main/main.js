const api = window.quickbrain

const els = {
  search: document.getElementById('search-input'),
  list: document.getElementById('note-list'),
  status: document.getElementById('status'),
  filterBtn: document.getElementById('filter-btn'),
  filterBadge: document.getElementById('filter-badge'),
  filterPopover: document.getElementById('filter-popover'),
  filterCatChips: document.getElementById('filter-cat-chips'),
  filterTypeChips: document.getElementById('filter-type-chips'),
  filterPrivacyChips: document.getElementById('filter-privacy-chips'),
  filterClear: document.getElementById('filter-clear'),
  batchToggleBtn: document.getElementById('batch-toggle-btn'),
  settingsBtnMain: document.getElementById('settings-btn-main'),
  floatBatch: document.getElementById('float-batch'),
  fbCount: document.getElementById('fb-count'),
  fbSelectAll: document.getElementById('fb-select-all'),
  fbSetPublic: document.getElementById('fb-set-public'),
  fbSetPrivate: document.getElementById('fb-set-private'),
  fbExit: document.getElementById('fb-exit'),
  fbReport: document.getElementById('fb-report'),
  reportModal: document.getElementById('report-modal'),
  reportMeta: document.getElementById('report-meta'),
  reportSourceCount: document.getElementById('report-source-count'),
  reportSourceList: document.getElementById('report-source-list'),
  reportNoteSearch: document.getElementById('report-note-search'),
  reportUrls: document.getElementById('report-urls'),
  reportPrompt: document.getElementById('report-prompt'),
  reportFiles: document.getElementById('report-files'),
  reportFileList: document.getElementById('report-file-list'),
  reportStream: document.getElementById('report-stream'),
  reportStats: document.getElementById('report-stats'),
  reportCancel: document.getElementById('report-cancel'),
  reportCopy: document.getElementById('report-copy'),
  reportSave: document.getElementById('report-save'),
  reportGenerate: document.getElementById('report-generate'),
  addBtn: document.getElementById('add-btn'),
  aiBtn: document.getElementById('ai-btn'),
  autoLaunchBtn: document.getElementById('auto-launch-btn'),
  modal: document.getElementById('add-modal'),
  aiModal: document.getElementById('ai-modal'),
  aiProviderList: document.getElementById('provider-list'),
  aiForm: document.getElementById('ai-form'),
  aiFormTitle: document.getElementById('ai-form-title'),
  aiApiKey: document.getElementById('ai-apikey'),
  aiToggleKey: document.getElementById('ai-toggle-key'),
  aiKeyHint: document.getElementById('ai-key-hint'),
  aiBaseUrlRow: document.getElementById('ai-baseurl-row'),
  aiModelRow: document.getElementById('ai-model-row'),
  aiBaseURL: document.getElementById('ai-baseurl'),
  aiModel: document.getElementById('ai-model'),
  aiStatus: document.getElementById('ai-status'),
  aiCurrent: document.getElementById('ai-current'),
  aiCancel: document.getElementById('ai-cancel'),
  aiTest: document.getElementById('ai-test'),
  aiSave: document.getElementById('ai-save'),
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
  syncOpenAiSettings: document.getElementById('sync-open-ai-settings'),
  syncUseDefaultUrl: document.getElementById('sync-use-default-url'),
  modalPrivate: document.getElementById('modal-private'),
  modalPrivateHint: document.getElementById('modal-private-hint'),
  settingsDefaultPrivate: document.getElementById('settings-default-private'),
  privacyBlock: document.getElementById('privacy-block'),
  embeddingToggle: document.getElementById('embedding-toggle'),
  embeddingBody: document.getElementById('embedding-body'),
  embeddingBaseUrl: document.getElementById('embedding-base-url'),
  embeddingApiKey: document.getElementById('embedding-api-key'),
  embeddingModel: document.getElementById('embedding-model'),
  embeddingDims: document.getElementById('embedding-dims'),
  embeddingUseDefault: document.getElementById('embedding-use-default'),
  embeddingStatus: document.getElementById('embedding-status'),
  embeddingStatusLine: document.getElementById('embedding-status-line'),
  embeddingTestBtn: document.getElementById('embedding-test'),
  embeddingSaveBtn: document.getElementById('embedding-save')
}

let allNotes = []
let currentSearch = ''
let currentCategory = 'all'
let currentType = 'all' // 'all' | 'source' | 'atom'
let currentPrivacy = 'all' // 'all' | 'private' | 'public'
let defaultPrivate = true
let aiReady = false
let selectionMode = false
const selectedIds = new Set()

async function loadNotes() {
  setStatus('加载中...')
  try {
    allNotes = await api.getAllNotes()
    window.__QB_LAST_NOTES__ = allNotes
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
  if (currentPrivacy === 'private') r = r.filter(n => n.is_private)
  else if (currentPrivacy === 'public') r = r.filter(n => !n.is_private)
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
    const checked = selectedIds.has(n.id) ? ' checked' : ''
    const privBadge = n.is_private ? '<span class="note-private-badge">🔒 仅本机</span>' : ''
    const privEmoji = n.is_private ? '🔒' : '\u2601\uFE0E'
    const privTitle = n.is_private ? '已设为仅本机，点击设为同步到云端' : '已同步到云端，点击设为仅本机保存'
    const classes = ['note-card']
    if (n.is_private) classes.push('is-private')
    if (selectionMode) classes.push('in-selection')
    if (selectedIds.has(n.id)) classes.push('selected')
    return (
      '<div class="' + classes.join(' ') + '" data-id="' + n.id + '">' +
        (selectionMode
          ? '<div class="note-card-checkbox"><input type="checkbox" data-id="' + n.id + '"' + checked + '></div>'
          : '') +
        '<div class="note-card-body">' +
          '<div class="note-card-title-row">' + privBadge + '<div class="note-card-title">' + escapeHtml(title) + '</div></div>' +
          '<div class="note-card-content">' + renderMarkdown(content) + '</div>' +
          '<div class="note-card-meta">' +
            '<span class="badge">' + escapeHtml(cat) + '</span>' +
            (tags.length ? tags.map(t => '<span class="badge">#' + escapeHtml(t) + '</span>').join('') : '') +
            '<span class="date">' + date + '</span>' +
          '</div>' +
        '</div>' +
        (selectionMode
          ? ''
          : '<div class="note-card-actions">' +
              '<button class="note-card-act note-card-priv' + (n.is_private ? ' priv-private' : '') + '" data-id="' + n.id + '" title="' + privTitle + '">' + privEmoji + '</button>' +
              '<button class="note-card-act note-card-edit" data-id="' + n.id + '" title="编辑">\u270F\uFE0F</button>' +
              '<button class="note-card-act note-card-format" data-id="' + n.id + '" title="AI 格式化">\u2728</button>' +
              '<button class="note-card-act note-card-del danger" data-id="' + n.id + '" title="删除">\u{1F5D1}</button>' +
            '</div>') +
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

  // Per-note privacy toggle. data-private="1" means currently private;
  // clicking moves it to public (and pushes an upsert to the server).
  els.list.querySelectorAll('.note-card-private').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation()
      const id = parseInt(btn.dataset.id, 10)
      const wasPrivate = btn.dataset.private === '1'
      const nextIsPrivate = !wasPrivate
      btn.disabled = true
      try {
        const r = await api.setNotePrivate(id, nextIsPrivate)
        if (!r || !r.ok) { setStatus('切换隐私状态失败: ' + (r && r.error)); return }
        await loadNotes()
        setStatus(nextIsPrivate ? '已设为仅本机保存，云端已撤销' : '已设为公开，同步中…')
      } catch (err) {
        setStatus('切换隐私状态失败: ' + err.message)
      } finally {
        btn.disabled = false
      }
    }
  })

  // Multi-select checkbox: clicking the box toggles this id in/out of the
  // selected set and re-renders only the batch bar (cheaper than render()).
  els.list.querySelectorAll('.note-card-checkbox input').forEach(cb => {
    cb.onclick = (e) => { e.stopPropagation() }
    cb.onchange = (e) => {
      const id = parseInt(cb.dataset.id, 10)
      if (cb.checked) selectedIds.add(id)
      else selectedIds.delete(id)
      console.log("[qb] cb.onchange id=" + id + " checked=" + cb.checked + " size=" + selectedIds.size + " selectionMode=" + selectionMode + " statusBefore=" + JSON.stringify(els.status && els.status.textContent))
      if (els.status && els.status.textContent ==="请先选择至少一条笔记") els.status.textContent ="就绪"
      console.log("[qb] statusAfter=" + JSON.stringify(els.status && els.status.textContent))
      renderFloatBatch()
      console.log("[qb] after renderFloatBatch floatBatch.show=" + (els.floatBatch && els.floatBatch.classList.contains("show")) + " size=" + selectedIds.size)
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
  // 2-step delete confirm: 1st click arms, 2nd within 3s confirms.
  els.list.querySelectorAll('.note-card-del').forEach(btn => {
    let armedTimer = null
    btn.onclick = async (e) => {
      e.stopPropagation()
      const id = parseInt(btn.dataset.id, 10)
      if (btn.classList.contains('confirm-delete')) {
        if (armedTimer) { clearTimeout(armedTimer); armedTimer = null }
        btn.classList.remove('confirm-delete')
        try {
          await api.deleteNote(id)
          await loadNotes()
          setStatus('已删除')
        } catch (err) {
          setStatus('删除失败: ' + err.message)
        }
        return
      }
      btn.classList.add('confirm-delete')
      if (armedTimer) clearTimeout(armedTimer)
      armedTimer = setTimeout(() => {
        btn.classList.remove('confirm-delete')
        armedTimer = null
      }, 3000)
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
// Double-click card to open editor; single-click flashes a brief highlight.
// Action buttons and checkboxes call stopPropagation so they are not affected.
els.list.querySelectorAll('.note-card').forEach(card => {
  card.ondblclick = (e) => {
    if (e.target.closest('.note-card-actions, .note-card-checkbox')) return
    const id = parseInt(card.dataset.id, 10)
    const note = allNotes.find(n => n.id === id)
    if (note) editNote(note)
  }
  card.onclick = () => {
    card.classList.remove('card-flash')
    void card.offsetWidth
    card.classList.add('card-flash')
    setTimeout(() => card.classList.remove('card-flash'), 1200)
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
async function showAddModal() {
  els.modalContent.value = ''
  els.modalCategory.value = currentCategory === 'all' ? '其他' : currentCategory
  // Refresh default privacy from settings in case the user toggled it
  // in Settings while the modal was last open.
  try {
    const s = await api.getSettings()
    if (s && typeof s.newNoteDefaultPrivate === 'boolean') defaultPrivate = s.newNoteDefaultPrivate
  } catch (_) {}
  els.modalPrivate.checked = defaultPrivate
  els.modalPrivateHint.textContent = defaultPrivate
    ? '默认隐私 · 可在设置中改为默认公开'
    : '默认公开 · 可在设置中改为默认隐私'
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
  const firstLine = content.split('\n').find(l => l.trim()) || ''
  const title = firstLine.trim().substring(0, 50) || '(无标题)'
  const category = els.modalCategory.value
  els.modalSave.disabled = true
  els.modalSave.textContent = '保存中...'
  try {
    await api.addNote({ content, title, category, is_private: els.modalPrivate.checked })
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


// ===== Multi-select + floating batch bar =====
function setSelectionMode(on) {
  selectionMode = !!on
  if (!on) selectedIds.clear()
  els.batchToggleBtn.classList.toggle('active', on)
  updateToolbarDisabled()
  render()
  renderFloatBatch()
}

function updateToolbarDisabled() {
  const disable = selectionMode
  for (const b of [els.addBtn, els.aiBtn, els.importBtn, els.settingsBtnMain]) {
    if (b) b.disabled = disable
  }
}

if (els.batchToggleBtn) {
els.batchToggleBtn.onclick = () => setSelectionMode(!selectionMode)
}

if (els.fbExit) {
els.fbExit.onclick = () => setSelectionMode(false)
}

if (els.fbSelectAll) {
els.fbSelectAll.onclick = () => {
    const visible = getFiltered().map(n => n.id)
    const allSelected = visible.length > 0 && visible.every(id => selectedIds.has(id))
    if (allSelected) visible.forEach(id => selectedIds.delete(id))
    else visible.forEach(id => selectedIds.add(id))
    render()
}
}

if (els.fbSetPublic) {
els.fbSetPublic.onclick = async () => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    setStatus('正在设为公开·' + ids.length + ' 条…')
    try {
      const r = await api.setNotesPrivateBulk(ids, false)
      if (r && r.ok) {
        setStatus('已将 ' + r.count + ' 条设为公开，同步中…')
        setSelectionMode(false)
        await loadNotes()
      } else {
        setStatus('设为公开失败: ' + (r && r.error))
      }
    } catch (e) { setStatus('设为公开失败: ' + e.message) }
}
}

if (els.fbSetPrivate) {
els.fbSetPrivate.onclick = async () => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    setStatus('正在设为隐私·' + ids.length + ' 条…')
    try {
      const r = await api.setNotesPrivateBulk(ids, true)
      if (r && r.ok) {
        setStatus('已将 ' + r.count + ' 条设为隐私，已从云端撤销')
        setSelectionMode(false)
        await loadNotes()
      } else {
        setStatus('设为隐私失败: ' + (r && r.error))
      }
    } catch (e) { setStatus('设为隐私失败: ' + e.message) }
}
}

function renderFloatBatch() {
  if (!els.floatBatch) return
  if (!selectionMode) { els.floatBatch.classList.remove('show'); return }
  els.floatBatch.classList.add('show')
  const count = selectedIds.size
  els.fbCount.textContent = '已选 ' + count + ' 条'
  els.fbSetPublic.disabled = count === 0
  els.fbSetPrivate.disabled = count === 0
  const visible = getFiltered().map(n => n.id)
  const allSelected = visible.length > 0 && visible.every(id => selectedIds.has(id))
  els.fbSelectAll.textContent = allSelected ? '取消全选' : '全选可见'
}

// ===== Filter popover =====
const FILTER_CATS = ['全部', '工作', '学习', '生活', '灵感', '其他']
const FILTER_TYPES = ['全部', '源笔记', '原子笔记']
const FILTER_PRIVS = ['全部', '🔒 仅本机', '☁︎ 已同步']

function renderFilterPopover() {
  const buildChips = (container, values, current, mapper) => {
    container.innerHTML = values.map((label, i) => {
      const value = mapper ? mapper(label, i) : label
      const isActive = value === current
      return '<span class="filter-popover-chip' + (isActive ? ' active' : '') + '" data-value="' + value + '">' + label + '</span>'
    }).join('')
  }
  buildChips(els.filterCatChips, FILTER_CATS, currentCategory, (_, i) => i === 0 ? 'all' : FILTER_CATS[i])
  buildChips(els.filterTypeChips, FILTER_TYPES, currentType, (_, i) => i === 0 ? 'all' : (i === 1 ? 'source' : 'atom'))
  buildChips(els.filterPrivacyChips, FILTER_PRIVS, currentPrivacy, (_, i) => i === 0 ? 'all' : (i === 1 ? 'private' : 'public'))

  const total = (currentCategory !== 'all' ? 1 : 0) + (currentType !== 'all' ? 1 : 0) + (currentPrivacy !== 'all' ? 1 : 0)
  els.filterBadge.textContent = total
  els.filterBadge.style.display = total > 0 ? '' : 'none'
}

function toggleFilterPopover() {
  const isHidden = els.filterPopover.classList.contains('hidden')
  if (isHidden) {
    renderFilterPopover()
    els.filterPopover.classList.remove('hidden')
  } else {
    els.filterPopover.classList.add('hidden')
  }
}

if (els.filterBtn) {
els.filterBtn.onclick = (e) => { e.stopPropagation(); toggleFilterPopover() }
}

els.filterPopover.addEventListener('click', (e) => {
  const chip = e.target.closest('.filter-popover-chip')
  if (!chip) return
  const value = chip.dataset.value
  const section = chip.parentElement
  if (section === els.filterCatChips) currentCategory = value
  else if (section === els.filterTypeChips) currentType = value
  else if (section === els.filterPrivacyChips) currentPrivacy = value
  renderFilterPopover()
  render()
})

if (els.filterClear) {
els.filterClear.onclick = () => {
    currentCategory = 'all'
    currentType = 'all'
    currentPrivacy = 'all'
    renderFilterPopover()
    render()
}
}

document.addEventListener('click', (e) => {
  if (els.filterPopover.classList.contains('hidden')) return
  if (els.filterPopover.contains(e.target)) return
  if (els.filterBtn.contains(e.target)) return
  els.filterPopover.classList.add('hidden')
})

document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return
  if (e.key !== 'm' && e.key !== 'M') return
  const tag = (e.target && e.target.tagName) || ''
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  e.preventDefault()
  setSelectionMode(!selectionMode)
})

if (els.addBtn) {
els.addBtn.onclick = showAddModal
}
if (els.modalCancel) {
els.modalCancel.onclick = hideAddModal
}
if (els.modalSave) {
els.modalSave.onclick = saveModal
}
if (els.modal) {
els.modal.onclick = (e) => { if (e.target === els.modal) hideAddModal() }
}

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

if (els.importBtn) {
els.importBtn.onclick = () => { els.importFile.value = ''; els.importFile.click() }
}
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

// #filters container removed; filter popover above handles filter state.
if (els.aiBtn) {
els.aiBtn.onclick = () => openAISettings()
}

async function refreshAutoLaunch() {
  try {
    const on = await api.getAutoLaunch()
    els.autoLaunchBtn.title = '开机自启: ' + (on ? '开' : '关')
    els.autoLaunchBtn.classList.toggle('active', on)
  } catch (e) { /* ignore */ }
}

if (els.autoLaunchBtn) {
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
  els.aiBaseUrlRow.style.display = p.customBaseURL ? 'flex' : 'none'
  els.aiModelRow.style.display = p.customModel ? 'flex' : 'none'
  els.aiBaseURL.value = aiCurrentConfig.baseURL || p.baseURL || ''
  els.aiModel.value = aiCurrentConfig.model || p.defaultModel || ''
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

if (els.aiToggleKey) {
els.aiToggleKey.onclick = () => {
    els.aiApiKey.type = els.aiApiKey.type === 'password' ? 'text' : 'password'
}
}

  if (els.aiTest) {
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
  }

if (els.aiSave) {
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
}

if (els.aiCancel) {
els.aiCancel.onclick = () => {
    els.aiModal.classList.remove('show')
}
}
// ---- Sync / Server Settings modal ----

async function openSyncSettings() {
  els.syncFeedbackSignup.className = 'sync-feedback'
  els.syncFeedbackSignup.textContent = ''
  els.syncFeedbackSignin.className = 'sync-feedback'
  els.syncFeedbackSignin.textContent = ''
  els.syncModal.classList.add('show')
  switchSyncTab('signup')
  // Sync the privacy defaults into the in-memory state so the next add-note
  // modal reflects the user's choice here.
  try {
    const s = await api.getSettings()
    if (s && typeof s.newNoteDefaultPrivate === 'boolean') {
      defaultPrivate = s.newNoteDefaultPrivate
      els.settingsDefaultPrivate.checked = s.newNoteDefaultPrivate
    }
  } catch (_) {}
  await refreshSyncStatus()
  await loadEmbeddingConfig()
}

function closeSyncSettings() {
  els.syncModal.classList.remove('show')
}

// ---- Embedding 向量嵌入配置 ----
async function loadEmbeddingConfig() {
  try {
    const c = await api.getEmbeddingConfig()
    els.embeddingBaseUrl.value = c.baseURL || ""
    els.embeddingApiKey.value = c.apiKey || ""
    els.embeddingModel.value = c.model || "bge-m3"
    els.embeddingDims.value = String(c.dims || 1024)
    await refreshEmbeddingStatus()
  } catch (e) {
    setEmbeddingStatus("加载配置失败: " + e.message, "idle")
  }
}

async function refreshEmbeddingStatus() {
  try {
    const s = await api.getEmbeddingStats(); window.__QB_LAST_LOAD_ERROR__ = s.loadError ? 'sqlite-vec 未加载: ' + s.loadError : null
    if (!s.loaded) {
      const __msg = (window.__QB_LAST_LOAD_ERROR__ || 'sqlite-vec 未加载，向量检索退化为普通搜索'); setEmbeddingStatus(__msg, "idle")
      return
    }
    els.embeddingStatusLine.textContent = "已索引 " + s.ok + "/" + s.total + " 条（待建 " + s.pending + " 条，失败 " + s.failed + " 条）"
    els.embeddingStatus.className = "embedding-status " + (s.failed > s.ok * 0.5 ? "bad" : "ok")
  } catch (e) {
    setEmbeddingStatus("加载配置失败: " + e.message, "idle")
  }
}

function setEmbeddingStatus(text, kind) {
  els.embeddingStatus.className = "embedding-status " + (kind || "idle")
  els.embeddingStatusLine.textContent = text
}

async function testEmbeddingConnection() {
  const baseURL = els.embeddingBaseUrl.value.trim().replace(/\/+$/, "")
  const apiKey = els.embeddingApiKey.value.trim()
  const model = els.embeddingModel.value.trim() || "bge-m3"
  if (!baseURL) { setEmbeddingStatus("请先填写 Base URL", "idle"); return }
  els.embeddingTestBtn.disabled = true
  setEmbeddingStatus("测试中...", "idle")
  try {
    const headers = { "Content-Type": "application/json" }
    if (apiKey) headers["Authorization"] = "Bearer " + apiKey
    const url = baseURL + "/v1/embeddings"
    const r = await fetch(url, {
      method: "POST", headers,
      body: JSON.stringify({ model, input: "hello" }),
      signal: AbortSignal.timeout(8000)
    })
    if (!r.ok) {
      setEmbeddingStatus("失败: HTTP " + r.status + " " + (await r.text().catch(()=>"")).slice(0,80), "bad")
      return
    }
    const j = await r.json()
    const dims = j && j.data && j.data[0] && j.data[0].embedding && j.data[0].embedding.length
    setEmbeddingStatus("连接成功（返回维度 " + (dims || "?") + "）", "ok")
  } catch (e) {
    setEmbeddingStatus("失败: " + e.message, "bad")
  } finally {
    els.embeddingTestBtn.disabled = false
  }
}

async function saveEmbeddingConfig() {
  const baseURL = els.embeddingBaseUrl.value.trim().replace(/\/+$/, "")
  const apiKey = els.embeddingApiKey.value.trim()
  const model = els.embeddingModel.value.trim() || "bge-m3"
  const dims = parseInt(els.embeddingDims.value, 10) || 1024
  try {
    await api.setEmbeddingConfig({ baseURL, apiKey, model, dims })
    setEmbeddingStatus("已保存", "ok")
    setTimeout(refreshEmbeddingStatus, 200)
  } catch (e) {
    setEmbeddingStatus("保存失败: " + e.message, "bad")
  }
}

function toggleEmbeddingSection() {
  const open = els.embeddingBody.classList.toggle("show")
  els.embeddingToggle.classList.toggle("open", open)
}

if (els.embeddingToggle) {
els.embeddingToggle.onclick = toggleEmbeddingSection
}
if (els.embeddingUseDefault) {
els.embeddingUseDefault.onclick = (e) => { e.preventDefault(); els.embeddingBaseUrl.value = "https://embedding.bjhzsk.cn"; els.embeddingBaseUrl.focus() }
}
if (els.embeddingTestBtn) {
els.embeddingTestBtn.onclick = testEmbeddingConnection
}
if (els.embeddingSaveBtn) {
els.embeddingSaveBtn.onclick = saveEmbeddingConfig
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
  // Local mode is the default. Only fill the URL inputs when the user has
  // already configured a server; a fresh install keeps them empty so the
  // modal does not look like something is broken or missing.
  els.syncServerUrl.value = c.serverUrl || ''
  els.syncTokenServerUrl.value = c.serverUrl || ''
  if (c.enabled && c.serverUrl) {
    els.syncStatusBox.className = 'sync-status connected'
    els.syncStatusLine.textContent = '已同步到 ' + c.serverUrl + (c.hasToken ? '（令牌已保存）' : '')
    els.syncDisconnect.style.display = ''
  } else {
    els.syncStatusBox.className = 'sync-status local'
    els.syncStatusLine.textContent = '本地模式：笔记只在本机保存。要在多设备间同步？注册账号或粘贴令牌即可启用云同步。'
    els.syncDisconnect.style.display = 'none'
  }
}

// One-click helper: fill both URL inputs with the bundled SaaS URL. We do
// not auto-fill on open because local mode is the obvious default; users
// who want cloud sync click this link to opt in.
async function useDefaultSyncServerUrl() {
  try {
    const d = await api.getDefaultSyncServerUrl()
    if (d && d.serverUrl) {
      els.syncServerUrl.value = d.serverUrl
      els.syncTokenServerUrl.value = d.serverUrl
      els.syncServerUrl.focus()
    }
  } catch (_) { /* leave the inputs as they are */ }
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

if (els.syncTabSignup) {
els.syncTabSignup.onclick = () => switchSyncTab('signup')
}
if (els.syncTabSignin) {
els.syncTabSignin.onclick = () => switchSyncTab('signin')
}

if (els.syncCancel) {
els.syncCancel.onclick = closeSyncSettings
}
if (els.syncOpenAiSettings) {
els.syncOpenAiSettings.onclick = (e) => { e.preventDefault(); closeSyncSettings(); openAISettings() }
}
if (els.syncUseDefaultUrl) {
els.syncUseDefaultUrl.onclick = (e) => { e.preventDefault(); useDefaultSyncServerUrl() }
}
els.syncModal.addEventListener('click', (e) => {
  if (e.target === els.syncModal) closeSyncSettings()
})

els.settingsDefaultPrivate.onchange = async () => {
  defaultPrivate = els.settingsDefaultPrivate.checked
  try {
    await api.setSettings({ newNoteDefaultPrivate: defaultPrivate })
  } catch (e) {
    setStatus('保存设置失败: ' + e.message)
  }
}

if (els.syncSubmitSignup) {
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
    await loadEmbeddingConfig()
        setTimeout(closeSyncSettings, 1200)
      } else {
        showSyncFeedback(els.syncFeedbackSignup, '失败：' + translateSyncError(r.error), false)
      }
    } catch (e) {
      showSyncFeedback(els.syncFeedbackSignup, '网络错误：' + e.message, false)
    }
    els.syncSubmitSignup.disabled = false
}
}

if (els.syncSubmitSignin) {
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
    await loadEmbeddingConfig()
        setTimeout(closeSyncSettings, 1200)
      } else {
        showSyncFeedback(els.syncFeedbackSignin, '失败：' + translateSyncError(r.error), false)
      }
    } catch (e) {
      showSyncFeedback(els.syncFeedbackSignin, '网络错误：' + e.message, false)
    }
    els.syncSubmitSignin.disabled = false
}
}

if (els.syncDisconnect) {
els.syncDisconnect.onclick = async () => {
    try {
      await api.setSyncConfig({ enabled: false })
      await refreshSyncStatus()
    await loadEmbeddingConfig()
    } catch (e) {
      api.log('error', ['[sync-disconnect]', e.message])
    }
}
}

// Wire the titlebar gear button to open the sync modal.
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
  if (!note) return
  try {
    await api.openEditor(note.id)
  } catch (e) {
    setStatus('打开编辑器失败: ' + e.message)
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
    currentPrivacy = 'all'
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

// ===== Report composer =====
let reportJobId = null
let reportFullText = ""
let reportFilePaths = []
function escapeHTML(s) {
  return (s || "").replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c] })
}
function renderReportNotePicker(query) {
  const q = (query || '').trim().toLowerCase()
  const notes = (allNotes || []).filter(function (n) { return !n.is_atom })
  els.reportSourceList.innerHTML = ""
  const matched = notes.filter(function (n) {
    if (!q) return true
    return (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q)
  })
  if (matched.length === 0) {
    const empty = document.createElement("div")
    empty.textContent = notes.length === 0 ? "暂无笔记" : "无匹配"
    els.reportSourceList.appendChild(empty)
    updateReportCount()
    return
  }
  matched.forEach(function (n) {
    const label = document.createElement("label")
    label.className = "report-pick-item"
    const cb = document.createElement("input")
    cb.type = "checkbox"
    cb.checked = selectedIds.has(n.id)
    cb.onchange = function () {
      if (cb.checked) selectedIds.add(n.id)
      else selectedIds.delete(n.id)
      updateReportCount()
    }
    const span = document.createElement("span")
    span.textContent = (n.title || '无标题')
    span.title = (n.title || '无标题')
    label.appendChild(cb)
    label.appendChild(span)
    els.reportSourceList.appendChild(label)
  })
  updateReportCount()
}

function updateReportCount() {
  if (els.reportSourceCount) els.reportSourceCount.textContent = String(selectedIds.size)
}

if (els.reportNoteSearch) {
    els.reportNoteSearch.addEventListener("input", function () {
      renderReportNotePicker(els.reportNoteSearch.value)
    })
}

function showReportModal() {
  renderReportNotePicker()
  updateReportCount()
  els.reportUrls.value = ""
  els.reportPrompt.value = ""
  els.reportFiles.value = ""
  els.reportFileList.innerHTML = ""
  reportFilePaths = []
  els.reportStream.textContent = ""
  els.reportStats.textContent = ""
  els.reportGenerate.disabled = false
  els.reportGenerate.textContent = "生成"
  els.reportCopy.style.display = "none"
  els.reportSave.style.display = "none"
  els.reportModal.classList.add("show")
  setTimeout(function () { els.reportPrompt.focus() }, 50)
}
function hideReportModal() {
  els.reportModal.classList.remove("show")
  if (reportJobId) { api.cancelReport(reportJobId); reportJobId = null }
}
if (els.reportCancel) {
els.reportCancel.onclick = hideReportModal
}
els.reportFiles.addEventListener("change", function () {
  els.reportFileList.innerHTML = ""
  reportFilePaths = []
  const files = els.reportFiles.files || []
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    const fp = api.getPathForFile(f)
    reportFilePaths.push(fp)
    const span = document.createElement("span")
    span.className = "report-file-item"
    span.textContent = "📎 " + f.name
    els.reportFileList.appendChild(span)
  }
})
if (els.reportGenerate) {
els.reportGenerate.onclick = async function () {
    const prompt = els.reportPrompt.value.trim()
    const urls = els.reportUrls.value.split("\n").map(function (s) { return s.trim() }).filter(Boolean)
    if (!prompt) {
      els.reportPrompt.focus()
      els.reportStats.textContent = "⚠ 请填写提示词"
      return
    }
    const noteIds = Array.from(selectedIds)
    if (noteIds.length === 0 && urls.length === 0 && reportFilePaths.length === 0) {
      els.reportStats.textContent = "⚠ 请至少勾选一条笔记、填一个 URL 或上传一个文件"
      return
    }
    els.reportGenerate.disabled = true
    els.reportGenerate.textContent = "生成中…"
    els.reportStream.textContent = ""
    els.reportStats.textContent = ""
    els.reportCopy.style.display = "none"
    els.reportSave.style.display = "none"
    reportFullText = ""
    try {
      const r = await api.startReport({ noteIds: noteIds, urls: urls, filePaths: reportFilePaths, prompt: prompt })
      if (!r || !r.ok) {
        els.reportGenerate.disabled = false
        els.reportGenerate.textContent = "生成"
        setStatus("生成失败: " + (r && r.error))
        return
      }
      reportJobId = r.jobId
    } catch (e) {
      els.reportGenerate.disabled = false
      els.reportGenerate.textContent = "生成"
      setStatus("生成失败: " + e.message)
    }
}
}
if (els.reportCopy) {
els.reportCopy.onclick = function () {
    api.writeClipboard(reportFullText)
    setStatus("已复制到剪贴板")
}
}
if (els.reportSave) {
els.reportSave.onclick = async function () {
    if (!reportFullText) return
    const firstLine = reportFullText.split("\n")[0].replace(/^#+\s*/, "").trim() || "报告"
    const title = "[报告] " + firstLine.substring(0, 50)
    try {
      await api.addNote({ content: reportFullText, title: title, category: "其他", tags: ["report"], is_private: 0 })
      setStatus("已保存为笔记")
      hideReportModal()
      setSelectionMode(false)
      await loadNotes()
    } catch (e) {
      setStatus("保存失败: " + e.message)
    }
}
}
if (els.fbReport) {
  if (els.fbReport) {
  els.fbReport.onclick = function () {
      showReportModal()
  }
    }
}

if (api.onReportMeta) {
  api.onReportMeta(function (jobId, meta) {
    if (jobId !== reportJobId) return
    els.reportStats.textContent = "策略=" + meta.strategy + " · 材料 " + meta.sources + " 份 · 约 " + meta.tokens + " tokens"
  })
}
if (api.onReportChunk) {
  api.onReportChunk(function (jobId, chunk) {
    if (jobId !== reportJobId) return
    reportFullText += chunk
    els.reportStream.textContent = reportFullText
    els.reportStream.scrollTop = els.reportStream.scrollHeight
  })
}
if (api.onReportLog) {
  api.onReportLog(function (jobId, log) {
    console.log("[report]", log)
  })
}
if (api.onReportDone) {
  api.onReportDone(function (jobId, info) {
    if (jobId !== reportJobId) return
    reportJobId = null
    els.reportGenerate.disabled = false
    els.reportGenerate.textContent = "再次生成"
    els.reportCopy.style.display = ""
    els.reportSave.style.display = ""
    els.reportStats.textContent = (els.reportStats.textContent || "") + " · 完成" + (info.error ? "（部分失败）" : "")
  })
}
if (api.onReportError) {
  api.onReportError(function (jobId, err) {
    if (jobId !== reportJobId) return
    reportJobId = null
    els.reportGenerate.disabled = false
    els.reportGenerate.textContent = "生成"
    if (err === "cancelled") { els.reportStats.textContent = "已取消"; return }
    els.reportStats.textContent = "失败: " + err
  })
}
if (els.settingsBtnMain) {
els.settingsBtnMain.onclick = openSyncSettings
}

// Custom frameless-window controls (minimize / toggle maximize / hide to tray).
function initWindowControls() {
  const min = document.getElementById('win-min')
  const max = document.getElementById('win-max')
  const close = document.getElementById('win-close')
  if (min) min.onclick = () => { if (api.windowControl) api.windowControl('minimize') }
  if (max) max.onclick = () => { if (api.windowControl) api.windowControl('toggle-max') }
  if (close) close.onclick = () => { if (api.hideWindow) api.hideWindow() }
  if (api.onWindowState) {
    api.onWindowState((maximized) => {
      if (!max) return
      max.textContent = maximized ? '❐' : '□'
      max.title = maximized ? '还原' : '最大化'
      max.classList.toggle('is-max', !!maximized)
    })
  }
}
initWindowControls()
