const api = window.paletteAPI
// 依赖 parser.js / registry.js 已作为 <script> 在 index.html 预先加载
// 其顶层声明的 function parseInput / findCommand 暴露为 window 全局
const _parseInput = window.parseInput
const _findCommand = window.findCommand

const log = (tag, msg, data) => {
  const line = '[' + tag + '] ' + msg + (data ? ' ' + JSON.stringify(data) : '')
  console.log(line)
  if (window.paletteAPI && window.paletteAPI.log) {
    window.paletteAPI.log('log', ['[palette]', line])
  }
}


let selectedIndex = 0
let currentResults = [] // [{type, group, ...}]

const els = {
  input: document.getElementById('search-input'),
  results: document.getElementById('results'),
  status: document.getElementById('status-bar')
}

let debounceTimer = null

els.input.addEventListener('input', () => {
  log('input', 'value=' + JSON.stringify(els.input.value))
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => doSearch(els.input.value), 100)
})

window.addEventListener('keydown', handleKeydown)

window.api = api
if (api.onPaletteReset) api.onPaletteReset(() => {
  els.input.value = ''
  currentResults = []
  selectedIndex = 0
  render()
  // Defer focus so the BrowserWindow has had time to actually take focus.
  requestAnimationFrame(() => {
    els.input.focus()
    els.input.select()
  })
})

function handleKeydown(e) {
  log('keydown', e.key + (e.ctrlKey ? '+ctrl' : '') + (e.shiftKey ? '+shift' : ''))
  if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1) }
  else if (e.key === 'Enter') {
    e.preventDefault()
    if (e.shiftKey) triggerAction('shift+enter')
    else if (e.ctrlKey) triggerAction('ctrl+enter')
    else triggerAction('enter')
  }
  else if (e.key === 'Escape') {
    e.preventDefault()
    if (els.input.value) els.input.value = ''
    else window.close()
  }
}

function moveSelection(delta) {
  if (currentResults.length === 0) return
  selectedIndex = (selectedIndex + delta + currentResults.length) % currentResults.length
  render()
}

async function doSearch(input) {
  log('doSearch:start', JSON.stringify(input))
  const parsed = _parseInput(input)
  log('doSearch:parsed', parsed.type, parsed)
  if (parsed.type === 'empty') {
    currentResults = []
    setStatus('就绪')
    render()
    return
  }

  if (parsed.type === 'ai-search') {
    currentResults = []
    setStatus('AI 召回中…')
    render()
    const summaryList = await fetchTopSummaries(50, parsed.query)
    log('doSearch:ai:summaryList', summaryList.length + ' items:')
    for (const s of summaryList) log('doSearch:ai:summary', s)
    const result = await api.semanticSearch({ query: parsed.query, candidateSummaries: summaryList })
    log('doSearch:ai:result', JSON.stringify(result))
    if (result && result.matchedIds && result.matchedIds.length) {
      currentResults = await fetchNotesByIds(result.matchedIds)
      setStatus(`AI 召回 ${currentResults.length} 条`)
    } else {
      // AI 没匹配上 → 回退到关键词搜索 + 提供"添加"入口
      log('doSearch:ai:fallback-keyword', parsed.query)
      const kwResults = await api.searchNotes(parsed.query).catch(() => [])
      log('doSearch:ai:fallback-keyword:results', kwResults.length)
      if (kwResults.length) {
        currentResults = kwResults.map(n => ({ type: 'note', note: n }))
        currentResults.push({ type: 'new-content', content: parsed.query })
        setStatus(`AI 未匹配 · 关键词找到 ${kwResults.length} 条 · 按 Enter 添加`)
      } else {
        currentResults = [{ type: 'new-content', content: parsed.query }]
        setStatus('AI 未匹配 · 按 Enter 添加为新笔记')
      }
    }
    render()
    return
  }

  if (parsed.type === 'ai-extract') {
    currentResults = []
    setStatus('AI 抽取中…')
    render()
    const summaryList = await fetchTopSummaries(50, parsed.query)
    log('doSearch:extract:summaryList', summaryList.length + ' items')
    let extract = null
    try {
      extract = await api.aiExtract({ query: parsed.query, candidateSummaries: summaryList })
      log('doSearch:extract:result', JSON.stringify(extract))
    } catch (e) {
      log('doSearch:extract:error', e.message)
    }
    const hit = extract && extract.value && String(extract.value).trim()
    if (hit) {
      // 找到字段值：尝试定位源笔记
      let sourceNote = null
      if (extract.sourceId) {
        const pool = await api.getRecentNotes(200).catch(() => [])
        sourceNote = pool.find(n => n.id === extract.sourceId) || null
      }
      const item = {
        type: 'extract',
        field: parsed.query,
        value: hit,
        confidence: extract.confidence || 0,
        sourceId: extract.sourceId || null,
        sourceNote: sourceNote
      }
      currentResults = [item]
      if (sourceNote) currentResults.push({ type: 'note', note: sourceNote })
      const srcTitle = sourceNote ? sourceNote.title : '未定位笔记'
      setStatus('AI 抽取 · Enter 复制 · 来自「' + srcTitle + '」')
    } else {
      // 未抽取到值 → 回退到 ai-search，再回退到关键词搜索
      log('doSearch:extract:fallback-ai-search', parsed.query)
      const ai = await api.semanticSearch({ query: parsed.query, candidateSummaries: summaryList }).catch(() => null)
      log('doSearch:extract:fallback-ai-search:result', JSON.stringify(ai))
      if (ai && ai.matchedIds && ai.matchedIds.length) {
        currentResults = await fetchNotesByIds(ai.matchedIds)
        setStatus('AI 未抽取到值 · 召回 ' + currentResults.length + ' 条')
      } else {
        const kwResults = await api.searchNotes(parsed.query).catch(() => [])
        log('doSearch:extract:fallback-kw:results', kwResults.length)
        if (kwResults.length) {
          currentResults = kwResults.map(n => ({ type: 'note', note: n }))
          currentResults.push({ type: 'new-content', content: parsed.query })
          setStatus('AI 未抽取 · 关键词找到 ' + kwResults.length + ' 条 · 按 Enter 添加')
        } else {
          currentResults = [{ type: 'new-content', content: parsed.query }]
          setStatus('AI 未抽取 · 按 Enter 添加为新笔记')
        }
      }
    }
    render()
    return
  }

  if (parsed.type === 'command') {
    const cmd = _findCommand(parsed.command)
    log('doSearch:command', parsed.command, cmd ? cmd.name : 'NOT_FOUND')
    currentResults = cmd ? [{ type: 'command', cmd, keyword: parsed.keyword }] : []
    setStatus(currentResults.length ? '命令' : '就绪')
    render()
    return
  }

  if (parsed.type === 'ai-format') {
    const results = await api.searchNotes(parsed.keyword || '')
    log('doSearch:ai-format:results', results.length)
    if (results.length === 0) { setStatus('未找到匹配'); render(); return }
    currentResults = [{ type: 'note', note: results[0] }]
    setStatus(`按 Enter AI ${parsed.style}`)
    render()
    return
  }

  // new-content — 默认搜索现有笔记, 附带"添加"建议
  try {
    log('doSearch:new-content:searching', parsed.content)
    const results = await api.searchNotes(parsed.content)
    log('doSearch:new-content:results', results.length, results.slice(0, 2).map(r => r.id))
    currentResults = results.map(n => ({ type: 'note', note: n }))
    currentResults.push({ type: 'new-content', content: parsed.content })
    setStatus(results.length > 0
      ? `找到 ${results.length} 条 · 按 Enter 添加 / Shift+Enter 详情`
      : '按 Enter 添加为新笔记')
  } catch (e) {
    currentResults = [{ type: 'new-content', content: parsed.content }]
    setStatus('按 Enter 添加 (搜索失败)')
  }
  render()
}

async function fetchTopSummaries(limit, query) {
  const ftsLimit = Math.max(limit, 50)
  const recentLimit = Math.max(limit, 50)
  const [ftsResults, recentResults] = await Promise.all([
    api.searchNotes(query || '', ftsLimit).catch(() => []),
    api.getRecentNotes(recentLimit).catch(() => [])
  ])
  log('fetchTopSummaries', 'query=' + JSON.stringify(query) + ' fts=' + ftsResults.length + ' recent=' + recentResults.length)
  const merged = []
  const seen = new Set()
  for (const r of ftsResults) {
    if (!seen.has(r.id)) { merged.push(r); seen.add(r.id) }
  }
  for (const r of recentResults) {
    if (!seen.has(r.id)) { merged.push(r); seen.add(r.id) }
  }
  return merged.slice(0, limit).map(r => `${r.id}: ${r.title || '(无标题)'} - ${(r.content || '').substring(0, 100)}`)
}

async function fetchNotesByIds(ids) {
  log('fetchNotesByIds:requested', JSON.stringify(ids))
  const all = await api.getRecentNotes(200)
  log('fetchNotesByIds:pool', 'size=' + all.length + ' ids=' + JSON.stringify(all.map(n => n.id)))
  const map = new Map(all.map(n => [n.id, n]))
  const found = ids.map(id => map.get(id)).filter(Boolean)
  log('fetchNotesByIds:found', 'size=' + found.length)
  return found.map(n => ({ type: 'note', note: n }))
}

function setStatus(text) {
  log('setStatus', text)
  els.status.textContent = text
}

function render() {
  log('render:start', 'results.length=' + currentResults.length)
  els.results.innerHTML = ''
  if (currentResults.length === 0) {
    els.results.innerHTML = '<div class="empty">输入关键词开始搜索</div>'
    return
  }
  currentResults.forEach((item, idx) => {
    const div = document.createElement('div')
    div.className = 'item' + (idx === selectedIndex ? ' selected' : '')
    if (item.type === 'command') {
      div.innerHTML = `<span class="item-icon">${item.cmd.icon}</span><span class="item-text">${item.cmd.name}${item.keyword ? ' ' + item.keyword : ''}</span>`
      div.onclick = () => { selectedIndex = idx; triggerAction('enter') }
    } else if (item.type === 'note') {
      const sourceBtn = (function () {
        if (!item.note.source_path) return ''
        const isW = item.note.source_type === 'web' || /^https?:\/\\//i.test(item.note.source_path || '')
        const label = isW ? '🔗' : '📁'
        const title = isW ? ('打开 ' + item.note.source_path) : ('定位 ' + item.note.source_path)
        return `<span class="item-reveal" data-path="${escapeHTML(item.note.source_path)}" data-web="${isW ? '1' : '0'}" title="${escapeHTML(title)}">${label}</span>`
      })()
      div.innerHTML = `<span class="item-icon">📝</span><span class="item-text">${escapeHTML(item.note.title || '(无标题)')}</span><span class="item-meta">${item.note.category || ''}</span>${sourceBtn}`
      div.onclick = () => { selectedIndex = idx; triggerAction('enter') }
      const reveal = div.querySelector('.item-reveal')
      if (reveal) {
        reveal.onclick = (e) => {
          e.stopPropagation()
          const isW = reveal.dataset.web === '1'
          const fn = isW ? api.openExternal(reveal.dataset.path) : api.revealInFolder(reveal.dataset.path)
          fn.then(r => {
            if (r && !r.success) setStatus('打开失败: ' + (r.error || ''))
          }).catch(err => setStatus('打开失败: ' + err.message))
        }
      }
    } else if (item.type === 'new-content') {
      div.innerHTML = `<span class="item-icon">✚</span><span class="item-text">添加: ${escapeHTML(item.content.substring(0, 60))}</span>`
      div.onclick = () => { selectedIndex = idx; triggerAction('enter') }
    } else if (item.type === 'extract') {
      const confPct = Math.round((item.confidence || 0) * 100)
      const srcTitle = item.sourceNote ? (item.sourceNote.title || '(无标题)') : '未定位'
      const valShort = String(item.value).substring(0, 80)
      div.innerHTML = `<span class="item-icon">⭐</span><span class="item-text">${escapeHTML(item.field)}: <b>${escapeHTML(valShort)}</b></span><span class="item-meta">抽取 · 来自「${escapeHTML(srcTitle)}」· ${confPct}%</span>`
      div.onclick = () => { selectedIndex = idx; triggerAction('enter') }
    }
    els.results.appendChild(div)
  })
  const itemHeight = 36
  els.results.scrollTop = Math.max(0, selectedIndex * itemHeight - els.results.clientHeight / 2)
}

function escapeHTML(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

async function triggerAction(mode) {
  log('triggerAction', mode, 'selectedIndex=' + selectedIndex)
  const item = currentResults[selectedIndex]
  if (!item) { log('triggerAction:no-item'); return }

  const ctx = buildContext()
  if (item.type === 'command') {
    await item.cmd.execute(ctx, item.keyword || '')
    return
  }
  if (item.type === 'new-content') {
    // 触发"添加笔记"命令
    const addCmd = _findCommand('添加笔记')
    await addCmd.execute(ctx, item.content)
    return
  }
  if (item.type === 'extract') {
    // Enter 复制抽取的字段值到剪贴板
    api.writeClipboard(String(item.value || ''))
    setStatus('已复制抽取值: ' + String(item.value || '').substring(0, 40))
    setTimeout(() => window.close(), 300)
    return
  }
  if (item.type === 'note') {
    if (mode === 'shift+enter') {
      // 打开详情浮层
      window.open(`detail.html?id=${item.note.id}`, '_blank', 'width=400,height=500')
      window.close()
    } else if (mode === 'ctrl+enter') {
      api.locateNoteInMain(item.note.id)
      window.close()
    } else {
      // Enter 默认：复制
      api.writeClipboard(item.note.content)
      setStatus('已复制到剪贴板')
      setTimeout(() => window.close(), 300)
    }
  }
}

function buildContext() {
  return {
    api,
    notify: (title, body) => api.notify({ title, body }),
    hidePalette: () => window.close(),
    showMainWindow: () => api.locateNoteInMain(null),
    openSettings: () => { api.locateNoteInMain(0); window.close() },
    openDataDir: () => { api.locateNoteInMain(0); window.close() },
    openAISettings: () => { api.openAISettingsInMain(); window.close() },
    exportAll: () => { api.locateNoteInMain(0); window.close() },
    importAll: () => { api.locateNoteInMain(0); window.close() },
    backupDB: () => { api.locateNoteInMain(0); window.close() },
    clearAll: () => { api.locateNoteInMain(0); window.close() },
    showStats: () => { api.locateNoteInMain(0); window.close() },
    relaunch: () => api.relaunch(),
    quit: () => api.quit(),
    showAbout: () => api.notify({ title: '速脑 v1.0', body: '个人知识助手' }),
    scheduleAIFormat: (id, content) => {
      // 后台异步 AI 格式化（不阻塞）
      api.formatWithAI({ content, style: 'summary' }).then(r => {
        if (r.success) api.updateNote({ id, title: extractTitle(r.formattedContent), content: r.formattedContent, is_formatted: 1 })
      })
    },
    runAIFormat: async (note, style) => {
      const r = await api.formatWithAI({ content: note.content, style })
      if (r.success) await api.updateNote({ id: note.id, title: extractTitle(r.formattedContent), content: r.formattedContent, original_content: note.content, is_formatted: 1 })
    },
    runCategorize: async (content) => {
      const r = await api.categorizeWithAI({ content })
      if (r && r.success && r.category) {
        return { category: r.category, tags: r.tags || [] }
      }
      return { category: '其他', tags: [] }
    }
  }
}

function extractTitle(text) {
  const firstLine = (text || '').split('\n')[0].trim()
  return firstLine.substring(0, 50) || '(无标题)'
}

