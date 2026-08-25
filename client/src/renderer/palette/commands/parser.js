// QuickBrain Spotlight - 输入解析器
// 解析调色板输入为 5 种类型：empty / ai-search / ai-format / command / new-content

const COMMAND_NAMES = [
  // 笔记操作
  '添加笔记',
  '格式化',
  '复制',
  '删除',
  '编辑',
  '分类',
  '重新分类',
  // 窗口 / 导航
  '打开主窗口',
  '打开设置',
  '打开数据目录',
  // 数据管理
  '导出所有笔记',
  '导入笔记',
  '备份数据库',
  '清空所有笔记',
  '显示统计',
  // 系统
  'AI 设置',
  '重启应用',
  '退出',
  '关于'
]

const STYLE_MAP = {
  '摘要': 'summary',
  '结构化': 'structured',
  '标签': 'tags',
  '思维导图': 'mindmap'
}

function parseInput(input) {
  if (!input || !input.trim()) return { type: 'empty' }

  const trimmed = input.trim()

  // 1. !? 前缀 → AI 字段抽取（找不到回退到 ai-search）
  if (trimmed.startsWith('!?') || trimmed.startsWith('！？')) {
    const query = trimmed.replace(/^[!?！？]+\s*/, '').trim()
    return { type: 'ai-extract', query }
  }

  // 2. ? 前缀 → AI 语义搜索（支持全角 ?）
  if (trimmed.startsWith('?') || trimmed.startsWith('？')) {
    const query = trimmed.replace(/^[?？]\s*/, '').trim()
    return { type: 'ai-search', query }
  }

  // 2. ai 前缀 → 显式 AI 格式化（大小写不敏感）
  if (trimmed.startsWith('ai ') || trimmed.startsWith('AI ')) {
    const rest = trimmed.slice(3).trim()
    const parts = rest.split(/\s+/, 2)
    const style = STYLE_MAP[parts[0]] || 'summary'
    const keyword = parts[1] || ''
    return { type: 'ai-format', style, keyword }
  }

  // 3. 完全匹配命令名
  if (COMMAND_NAMES.includes(trimmed)) {
    return { type: 'command', command: trimmed, keyword: '' }
  }

  // 4. 命令名 + 关键词（前缀匹配，避免「打开主窗口」误匹配「打开」）
  for (const cmd of COMMAND_NAMES) {
    if (trimmed.startsWith(cmd + ' ')) {
      const keyword = trimmed.slice(cmd.length + 1).trim()
      return { type: 'command', command: cmd, keyword }
    }
  }

  // 5. 其余视为新内容
  return { type: 'new-content', content: trimmed }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseInput, COMMAND_NAMES, STYLE_MAP }
}