
const registry = [
  // 操作类
  {
    name: '添加笔记', icon: '✚',
    keywords: ['add', 'new'],
    execute: async (ctx, content) => {
      const id = await ctx.api.addNote({
        title: '',
        content: content || '',
        tags: [],
        category: 'uncategorized',
        original_content: content || ''
      })
      ctx.notify('已添加', 'AI 格式化中…')
      ctx.scheduleAIFormat(id, content || '')
      ctx.hidePalette()
    }
  },
  {
    name: '格式化', icon: '✨', requiresKeyword: true,
    execute: async (ctx, keyword) => {
      const results = await ctx.api.searchNotes(keyword)
      if (results.length === 0) { ctx.notify('未找到', `没有匹配 "${keyword}"`); return }
      const note = results[0]
      await ctx.runAIFormat(note, 'summary')
      ctx.hidePalette()
    }
  },
  {
    name: '复制', icon: '📋', requiresKeyword: true,
    execute: async (ctx, keyword) => {
      const results = await ctx.api.searchNotes(keyword)
      if (results.length === 0) { ctx.notify('未找到', `没有匹配 "${keyword}"`); return }
      const { clipboard } = require('electron')
      clipboard.writeText(results[0].content)
      ctx.notify('已复制', results[0].title)
      ctx.hidePalette()
    }
  },
  {
    name: '删除', icon: '🗑', requiresKeyword: true, dangerous: true,
    execute: async (ctx, keyword) => {
      const results = await ctx.api.searchNotes(keyword)
      if (results.length === 0) { ctx.notify('未找到', `没有匹配 "${keyword}"`); return }
      if (!confirm(`确认删除 "${results[0].title}"？`)) return
      await ctx.api.deleteNote(results[0].id)
      ctx.notify('已删除', results[0].title)
      ctx.hidePalette()
    }
  },
  {
    name: '编辑', icon: '✎', requiresKeyword: true,
    execute: async (ctx, keyword) => {
      const results = await ctx.api.searchNotes(keyword)
      if (results.length === 0) { ctx.notify('未找到', `没有匹配 "${keyword}"`); return }
      ctx.api.locateNoteInMain(results[0].id)
      ctx.hidePalette()
    }
  },
  {
    name: '分类', icon: '🏷', requiresKeyword: true,
    execute: async (ctx, args) => {
      const parts = (args || '').split(/\s+/)
      const keyword = parts[0]
      const category = parts[1] || '其他'
      const results = await ctx.api.searchNotes(keyword)
      if (results.length === 0) { ctx.notify('未找到', `没有匹配 "${keyword}"`); return }
      await ctx.api.updateNote({ id: results[0].id, category })
      ctx.notify('已分类', `${results[0].title} → ${category}`)
      ctx.hidePalette()
    }
  },
  {
    name: '重新分类', icon: '🤖', requiresKeyword: true,
    execute: async (ctx, keyword) => {
      const results = await ctx.api.searchNotes(keyword)
      if (results.length === 0) { ctx.notify('未找到', `没有匹配 "${keyword}"`); return }
      const note = results[0]
      const cat = await ctx.runCategorize(note.content)
      await ctx.api.updateNote({ id: note.id, category: cat.category, tags: cat.tags })
      ctx.notify('已重新分类', `${note.title} → ${cat.category}`)
      ctx.hidePalette()
    }
  },
  // 导航类
  { name: '打开主窗口', icon: '◫', execute: (ctx) => { ctx.showMainWindow(); ctx.hidePalette() } },
  { name: '打开设置', icon: '⚙', execute: (ctx) => { ctx.showMainWindow(); ctx.hidePalette(); ctx.openSettings() } },
  { name: '打开数据目录', icon: '📁', execute: (ctx) => { ctx.openDataDir(); ctx.hidePalette() } },
  // 数据类
  { name: '导出所有笔记', icon: '⬇', execute: (ctx) => { ctx.exportAll(); ctx.hidePalette() } },
  { name: '导入笔记', icon: '⬆', execute: (ctx) => { ctx.importAll(); ctx.hidePalette() } },
  { name: '备份数据库', icon: '💾', execute: (ctx) => { ctx.backupDB(); ctx.hidePalette() } },
  { name: '清空所有笔记', icon: '⚠', dangerous: true, execute: (ctx) => { if (!confirm('确认清空所有笔记？此操作不可撤销。')) return; ctx.clearAll(); ctx.hidePalette() } },
  { name: '显示统计', icon: '📊', execute: (ctx) => { ctx.showStats(); } },
  // AI 类
  { name: 'AI 设置', icon: '🔑', execute: (ctx) => { ctx.showMainWindow(); ctx.hidePalette(); ctx.openAISettings() } },
  // 系统类
  { name: '重启应用', icon: '↻', execute: (ctx) => { ctx.relaunch(); } },
  { name: '退出', icon: '✕', execute: (ctx) => { ctx.quit(); } },
  { name: '关于', icon: 'ⓘ', execute: (ctx) => { ctx.showAbout(); } },

  {
    name: '抽取', icon: '🧠', requiresKeyword: true,
    execute: async (ctx, keyword) => {
      const r = await ctx.api.extractSearch(keyword, false)
      ctx.notify(r.extracted > 0 ? '已抽取 ' + r.extracted + ' 个源' : '没有可抽取的源')
      ctx.hidePalette()
    }
  },
  {
    name: '重抽', icon: '🔁', requiresKeyword: true, dangerous: true,
    execute: async (ctx, keyword) => {
      if (!confirm('重抽会删除已有的原子，确定 "' + keyword + '" 吗？')) return
      const r = await ctx.api.extractSearch(keyword, true)
      ctx.notify('已重抽 ' + r.extracted + ' 个源')
      ctx.hidePalette()
    }
  },
  {
    name: '抽取全部', icon: '🧠',
    execute: async (ctx) => {
      const r = await ctx.api.extractSearch('', false)
      ctx.notify('已抽取 ' + r.extracted + ' 个源')
      ctx.hidePalette()
    }
  },
]

function findCommand(name) {
  return registry.find(c => c.name === name)
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { registry, findCommand }
}
