const api = window.paletteAPI
const { parseInput } = require('./commands/parser.js')
const { findCommand } = require('./commands/registry.js')

let selectedIndex = 0
let currentResults = [] // [{type, group, ...}]

const els = {
  input: document.getElementById('search-input'),
  results: document.getElementById('results'),
  status: document.getElementById('status-bar')
}

let debounceTimer = null

els.input.addEventListener('input', () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => doSearch(els.input.value), 100)
})

els.input.addEventListener('keydown', handleKeydown)

window.api = api
window.addEventListener('palette-reset', () => {
  els.input.value = ''
  currentResults = []
  selectedIndex = 0
  render()
  els.input.focus()
})

if (api.onPaletteReset) api.onPaletteReset(() => {
  els.input.value = ''
  currentResults = []
  selectedIndex = 0
  render()
  els.input.focus()
})

function handleKeydown(e) {
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
  const parsed = parseInput(input)
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
    const summaryList = await fetchTopSummaries(20)
    const result = await api.semanticSearch({ query: parsed.query, candidateSummaries: summaryList })
    if (result && result.matchedIds) {
      currentResults = await fetchNotesByIds(result.matchedIds)
      setStatus(`AI 召回 ${currentResults.length} 条`)
    } else {
      setStatus('AI 召回失败')
    }
    render()
    return
  }

  if (parsed.type === 'command') {
    const cmd = findCommand(parsed.command)
    currentResults = cmd ? [{ type: 'command', cmd, keyword: parsed.keyword }] : []
    setStatus(currentResults.length ? '命令' : '就绪')
    render()
    return
  }

  // new-content — 也展示"添加"建议
  currentResults = [{ type: 'new-content', content: parsed.content }]
  setStatus('按 Enter 添加')
  render()
}

async function fetchTopSummaries(limit) {
  const results = await api.searchNotes('')
  return results.slice(0, limit).map(r => `${r.id}: ${r.title} - ${(r.content || '').substring(0, 100)}`)
}

async function fetchNotesByIds(ids) {
  const all = await api.searchNotes('')
  const map = new Map(all.map(n => [n.id, n]))
  return ids.map(id => map.get(id)).filter(Boolean).map(n => ({ type: 'note', note: n }))
}

function setStatus(text) { els.status.textContent = text }

function render() {
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
      div.innerHTML = `<span class="item-icon">📝</span><span class="item-text">${escapeHTML(item.note.title || '(无标题)')}</span><span class="item-meta">${item.note.category || ''}</span>`
      div.onclick = () => { selectedIndex = idx; triggerAction('enter') }
    } else if (item.type === 'new-content') {
      div.innerHTML = `<span class="item-icon">✚</span><span class="item-text">添加: ${escapeHTML(item.content.substring(0, 60))}</span>`
      div.onclick = () => { selectedIndex = idx; triggerAction('enter') }
    }
    els.results.appendChild(div)
  })
  els.results.scrollTop = selectedIndex * 36 - 100
}

function escapeHTML(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

async function triggerAction(mode) {
  const item = currentResults[selectedIndex]
  if (!item) return

  const ctx = buildContext()
  if (item.type === 'command') {
    await item.cmd.execute(ctx, item.keyword || '')
    return
  }
  if (item.type === 'new-content') {
    // 触发"添加笔记"命令
    const addCmd = findCommand('添加笔记')
    await addCmd.execute(ctx, item.content)
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
      const { clipboard } = require('electron')
      clipboard.writeText(item.note.content)
      setStatus('已复制到剪贴板')
      setTimeout(() => window.close(), 300)
    }
  }
}

function buildContext() {
  return {
    api,
    notify: (title, body) => {
      // 通过 IPC 发通知（由主进程处理）
      api.searchNotes('').catch(() => {}) // 占位
      const { Notification } = require('electron')
      new Notification(title, { body }).show()
    },
    hidePalette: () => window.close(),
    showMainWindow: () => api.locateNoteInMain(0),
    openSettings: () => alert('请在主窗口中打开设置'),
    openDataDir: () => alert('请在主窗口中打开数据目录'),
    openAISettings: () => alert('请在主窗口中打开 AI 设置'),
    exportAll: () => alert('导出功能在主窗口'),
    importAll: () => alert('导入功能在主窗口'),
    backupDB: () => alert('备份功能在主窗口'),
    clearAll: () => alert('清空功能在主窗口'),
    showStats: () => alert('统计功能在主窗口'),
    relaunch: () => { const { app } = require('electron'); app.relaunch(); app.quit() },
    quit: () => { const { app } = require('electron'); app.quit() },
    showAbout: () => alert('QuickBrain v1.0'),
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
      return { category: '其他', tags: [] } // 简化：实际调用 API
    }
  }
}

function extractTitle(text) {
  const firstLine = (text || '').split('\n')[0].trim()
  return firstLine.substring(0, 50) || '(无标题)'
}

