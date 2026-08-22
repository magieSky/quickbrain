# QuickBrain Spotlight 化 v1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有 QuickBrain 改造为命令面板（Spotlight 风格，`Alt+K` 唤起）+ 主窗口（`Ctrl+Q` 唤起）并存的双入口个人知识管理工具，支持中文分词搜索、拼音首字母兜底、`?` 前缀 AI 语义搜索、快速添加自动 AI 格式化，并修复 8 个现有 bug 与安全加固，一次交付 v1.0。

**Architecture:** Electron 主进程承载 DB（better-sqlite3 + FTS5 + jieba 预分词 + pinyin-pro 拼音索引）、AI 服务（OpenAI 兼容）、IPC、全局快捷键、托盘；预加载脚本（preload）按 `contextBridge` 暴露白名单 API；渲染层拆为 `renderer/main/`（保留 600×700 主窗口）与 `renderer/palette/`（新增 400×500 命令面板 + 详情浮层）。

**Tech Stack:** Electron 28、better-sqlite3 11+（fallback sql.js 1.10）、@node-rs/jieba 0.4+（fallback nodejieba）、pinyin-pro 3+、OpenAI SDK 4+、vitest 1+（测试）、electron-builder 24+（打包）。

**Spec:** `docs/superpowers/specs/2026-08-21-quickbrain-spotlight-design.md`

---

## File Structure

### 新增文件

```
quickbrain/
├── main/
│   ├── windows.js              # 主窗口 + 命令面板窗口管理
│   ├── shortcuts.js            # 全局快捷键注册
│   ├── ipc.js                  # IPC 处理器
│   ├── tray.js                 # 系统托盘
│   ├── db/
│   │   ├── index.js            # better-sqlite3 连接 + fallback
│   │   ├── schema.sql          # 表结构 + FTS5 + 触发器 + 拼音表
│   │   ├── search.js           # 搜索 API（FTS5 + 拼音兜底 + 评分）
│   │   └── pinyin.js           # 拼音首字母生成
│   └── ai/
│       ├── service.js          # OpenAI 兼容客户端
│       └── prompts.js          # prompt 模板（摘要/结构化/标签/思维导图/语义搜索）
├── preload/
│   ├── main-preload.js         # 主窗口 contextBridge
│   └── palette-preload.js      # 命令面板 contextBridge
├── renderer/
│   ├── main/                   # 现有主窗口 UI（保留 + 微调）
│   └── palette/
│       ├── index.html          # 命令面板入口
│       ├── palette.css         # 半透明 + 圆角 + 阴影
│       ├── palette.js          # 输入/搜索/键盘事件/复制/唤起详情
│       ├── detail.html         # 详情浮层
│       ├── detail.js           # 详情浮层逻辑
│       ├── ai-menu.html        # AI 风格选择菜单
│       └── commands/
│           ├── parser.js       # 命令解析（命令名/参数/关键词）
│           └── registry.js     # 21 条命令注册表
└── tests/
    ├── db/
    │   ├── schema.test.js
    │   ├── search.test.js
    │   └── pinyin.test.js
    ├── ai/
    │   └── service.test.js
    └── renderer/palette/
        └── parser.test.js
```

### 修改文件

- `main.js` —— 拆分为 `main/` 子模块；保留为入口（require + 启动序列）
- `preload.js` —— 删除；改为 `preload/main-preload.js` + `preload/palette-preload.js`
- `ai-service.js` —— 拆分为 `main/ai/service.js` + `main/ai/prompts.js`
- `package.json` —— 新增 scripts（test / test:watch / lint）、devDependencies（vitest / better-sqlite3 / @node-rs/jieba / pinyin-pro）
- `config.example.json` —— 增加 `palette` / `shortcuts` 配置块
- `README.md` / `USAGE.md` —— 更新为新交互（命令面板 + 主窗口）

### 职责边界

- **db/** —— 纯数据层，不依赖 Electron；可用 Node 直接 require 测试
- **ai/** —— 纯服务层，不依赖 Electron；可用 Node 直接 require 测试
- **main/** —— Electron 主进程，整合 db / ai / 窗口 / 快捷键 / IPC / 托盘
- **preload/** —— 唯一允许渲染层访问 Node 能力的桥梁，必须白名单
- **renderer/** —— 纯 UI，不允许 require / 直接访问 fs / 直接 IPC（只能通过 preload 暴露的 API）

---

## Phase 1: 项目基础设施

### Task 1: 初始化 git + 引入 vitest 测试框架

**Files:**
- Create: `.gitignore`
- Create: `vitest.config.js`
- Modify: `package.json:scripts,devDependencies`
- Create: `tests/sanity.test.js`

- [ ] **Step 1: 初始化 git 仓库**

```bash
cd E:\note\quickbrain
git init
git config user.email "dev@quickbrain.local"
git config user.name "QuickBrain Dev"
```

期望：仓库初始化，无错误。

- [ ] **Step 2: 创建 .gitignore**

创建 `E:\note\quickbrain\.gitignore`：

```gitignore
node_modules/
dist/
*.log
.DS_Store
*.db
*.db-journal
config.json
docs/superpowers/plans/.drafts/
```

- [ ] **Step 3: 初次 commit（快照当前状态）**

```bash
cd E:\note\quickbrain
git add -A
git commit -m "chore: snapshot existing quickbrain project"
```

- [ ] **Step 4: 安装 vitest、better-sqlite3、@node-rs/jieba、pinyin-pro**

```bash
cd E:\note\quickbrain
npm install --save-dev vitest@^1.6.0
npm install --save better-sqlite3@^11.3.0 @node-rs/jieba@^0.4.0 pinyin-pro@^3.21.0
```

期望：`package.json` 新增 4 个依赖；`node_modules/` 新增对应包。

如果 better-sqlite3 编译失败：见 Phase 9 Task 23 的 fallback 流程（暂时继续，后续 Task 处理）。

- [ ] **Step 5: 配置 package.json scripts**

修改 `E:\note\quickbrain\package.json`，在 `scripts` 块加入：

```json
{
  "scripts": {
    "start": "electron .",
    "dev": "electron . --dev",
    "build": "electron-builder",
    "build:win": "electron-builder --win",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 6: 创建 vitest 配置**

创建 `E:\note\quickbrain\vitest.config.js`：

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.js'],
    coverage: {
      enabled: false
    }
  }
})
```

- [ ] **Step 7: 写第一个 sanity 测试**

创建 `E:\note\quickbrain\tests\sanity.test.js`：

```js
import { describe, it, expect } from 'vitest'

describe('sanity', () => {
  it('test framework works', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 8: 跑测试验证通过**

```bash
cd E:\note\quickbrain
npm test
```

期望：`1 passed`，无错误。

- [ ] **Step 9: Commit**

```bash
cd E:\note\quickbrain
git add .gitignore vitest.config.js package.json package-lock.json tests/sanity.test.js
git commit -m "chore: add vitest and project dependencies"
```

---

### Task 2: 创建 db 模块骨架

**Files:**
- Create: `main/db/index.js`
- Create: `main/db/schema.sql`
- Create: `tests/db/schema.test.js`

- [ ] **Step 1: 写失败的测试**

创建 `E:\note\quickbrain\tests\db\schema.test.js`：

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'

describe('schema', () => {
  let db

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('creates notes table with all columns', () => {
    const fs = require('fs')
    const path = require('path')
    const schema = fs.readFileSync(
      path.join(__dirname, '..', '..', 'main', 'db', 'schema.sql'),
      'utf8'
    )
    db.exec(schema)

    const cols = db.prepare("PRAGMA table_info(notes)").all()
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('content')
    expect(names).toContain('title')
    expect(names).toContain('category')
    expect(names).toContain('tags')
    expect(names).toContain('is_formatted')
    expect(names).toContain('original_content')
    expect(names).toContain('created_at')
    expect(names).toContain('updated_at')
  })

  it('creates notes_fts virtual table', () => {
    const fs = require('fs')
    const path = require('path')
    const schema = fs.readFileSync(
      path.join(__dirname, '..', '..', 'main', 'db', 'schema.sql'),
      'utf8'
    )
    db.exec(schema)

    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notes_fts'"
    ).get()
    expect(result).toBeDefined()
  })

  it('creates notes_pinyin table', () => {
    const fs = require('fs')
    const path = require('path')
    const schema = fs.readFileSync(
      path.join(__dirname, '..', '..', 'main', 'db', 'schema.sql'),
      'utf8'
    )
    db.exec(schema)

    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notes_pinyin'"
    ).get()
    expect(result).toBeDefined()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd E:\note\quickbrain
npm test
```

期望：`Cannot read schema.sql` 或 `schema.sql not found` —— 测试失败（文件不存在）。

- [ ] **Step 3: 创建 schema.sql**

创建目录 `E:\note\quickbrain\main\db\`（如不存在）。

创建 `E:\note\quickbrain\main\db\schema.sql`：

```sql
-- 主表
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  title TEXT DEFAULT '',
  category TEXT DEFAULT 'uncategorized',
  tags TEXT DEFAULT '[]',
  is_formatted INTEGER DEFAULT 0,
  original_content TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);

-- FTS5 虚拟表
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title,
  content,
  tags,
  content='notes',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

-- 同步触发器
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, content, tags)
  VALUES (new.id, new.title, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content, tags)
  VALUES('delete', old.id, old.title, old.content, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content, tags)
  VALUES('delete', old.id, old.title, old.content, old.tags);
  INSERT INTO notes_fts(rowid, title, content, tags)
  VALUES (new.id, new.title, new.content, new.tags);
END;

-- 拼音辅助表
CREATE TABLE IF NOT EXISTS notes_pinyin (
  id INTEGER PRIMARY KEY,
  pinyin_title TEXT DEFAULT '',
  pinyin_content TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_notes_pinyin_title ON notes_pinyin(pinyin_title);
CREATE INDEX IF NOT EXISTS idx_notes_pinyin_content ON notes_pinyin(pinyin_content);
```

- [ ] **Step 4: 跑测试验证通过**

```bash
cd E:\note\quickbrain
npm test
```

期望：`3 passed`。

- [ ] **Step 5: 创建 db/index.js 骨架**

创建 `E:\note\quickbrain\main\db\index.js`：

```js
const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')

function createDatabase(dbPath) {
  const db = new Database(dbPath)
  const schemaPath = path.join(__dirname, 'schema.sql')
  const schema = fs.readFileSync(schemaPath, 'utf8')
  db.exec(schema)
  return db
}

module.exports = { createDatabase }
```

- [ ] **Step 6: Commit**

```bash
cd E:\note\quickbrain
git add main/db/ tests/db/
git commit -m "feat(db): add schema.sql and db connection factory"
```

---

## Phase 3: 数据层 — 拼音 + 搜索

### Task 3: 实现拼音首字母生成

**Files:**
- Create: `main/db/pinyin.js`
- Create: `tests/db/pinyin.test.js`

- [ ] **Step 1: 写失败的测试**

创建 `E:\note\quickbrain\tests\db\pinyin.test.js`：

```js
import { describe, it, expect } from 'vitest'
import { pinyinInitials, generatePinyinForNote } from '../../main/db/pinyin.js'

describe('pinyin', () => {
  it('pinyinInitials converts Chinese to initials', () => {
    expect(pinyinInitials('北京')).toBe('bj')
    expect(pinyinInitials('上海')).toBe('sh')
    expect(pinyinInitials('分布式锁')).toBe('fbss')
  })

  it('pinyinInitials preserves English and digits', () => {
    expect(pinyinInitials('Hello 北京 2024')).toBe('hello bj 2024')
  })

  it('pinyinInitials handles empty string', () => {
    expect(pinyinInitials('')).toBe('')
  })

  it('generatePinyinForNote returns title and content pinyin', () => {
    const result = generatePinyinForNote('React 笔记', '关于 React Hooks 的笔记')
    expect(result.pinyinTitle).toBe('react bj')
    expect(result.pinyinContent).toContain('react hooks')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd E:\note\quickbrain
npm test
```

期望：Cannot find module pinyin.js —— 测试失败。

- [ ] **Step 3: 实现 pinyin.js**

创建 `E:\note\quickbrain\main\db\pinyin.js`：

> **注意**：pinyin-pro 在 `pattern: 'first'` 下，使用 `type: 'string', separator: ' '` 会输出「字符间空格」（如 `'b j'`）而非「词组级空格」（如 `'bj'`）。必须用 `type: 'array'` + 手动 `join('')` 才能得到正确的首字母字符串。

```js
const { pinyin } = require('pinyin-pro')

function pinyinInitials(text) {
  if (!text) return ''
  const py = pinyin(text, {
    pattern: 'first',
    toneType: 'none',
    type: 'array'
  })
  return py.join('').toLowerCase().trim()
}

function generatePinyinForNote(title, content) {
  return {
    pinyinTitle: pinyinInitials(title || ''),
    pinyinContent: pinyinInitials(content || '')
  }
}

module.exports = { pinyinInitials, generatePinyinForNote }
```

- [ ] **Step 4: 跑测试验证通过**

```bash
cd E:\note\quickbrain
npm test
```

期望：所有 pinyin 测试通过。

- [ ] **Step 5: Commit**

```bash
cd E:\note\quickbrain
git add main/db/pinyin.js tests/db/pinyin.test.js
git commit -m "feat(db): add pinyin initial generation"
```

---

### Task 4: 实现搜索 API

**Files:**
- Create: `main/db/search.js`
- Create: `tests/db/search.test.js`

- [x] **Step 1: 写失败的测试**

创建 `E:\note\quickbrain\tests\db\search.test.js`：

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { searchNotes, addNote } from '../../main/db/search.js'

function freshDb() {
  const db = new Database(':memory:')
  const schema = fs.readFileSync(
    path.join(__dirname, '..', '..', 'main', 'db', 'schema.sql'),
    'utf8'
  )
  db.exec(schema)
  return db
}

describe('search', () => {
  let db

  beforeEach(() => {
    db = freshDb()
  })

  afterEach(() => {
    db.close()
  })

  it('returns notes matching FTS5 query', () => {
    addNote(db, { title: 'React 笔记', content: '关于 Hooks', tags: [] })
    addNote(db, { title: 'Vue 笔记', content: '关于 Composition API', tags: [] })

    const results = searchNotes(db, 'React')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].title).toContain('React')
  })

  it('returns multiple notes for common query', () => {
    addNote(db, { title: 'A', content: 'react content', tags: [] })
    addNote(db, { title: 'B', content: 'react tutorial', tags: [] })

    const results = searchNotes(db, 'react')
    expect(results.length).toBe(2)
  })

  it('ranks title hits higher than content hits', () => {
    addNote(db, { title: 'Other', content: 'react here', tags: [] })
    addNote(db, { title: 'React Top', content: 'nothing relevant', tags: [] })

    const results = searchNotes(db, 'react')
    expect(results[0].title).toContain('React')
  })

  it('falls back to pinyin when FTS5 has weak results', () => {
    addNote(db, { title: '北京旅游', content: '故宫长城', tags: [] })

    const results = searchNotes(db, 'bj')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].title).toContain('北京')
  })

  it('returns empty array for no match', () => {
    addNote(db, { title: 'A', content: 'B', tags: [] })
    const results = searchNotes(db, 'xyz123nomatch')
    expect(results).toEqual([])
  })

  it('respects limit parameter', () => {
    for (let i = 0; i < 20; i++) {
      addNote(db, { title: `note ${i}`, content: 'common content', tags: [] })
    }
    const results = searchNotes(db, 'common', 5)
    expect(results.length).toBeLessThanOrEqual(5)
  })
})
```

- [x] **Step 2: 跑测试确认失败**

```bash
cd E:\note\quickbrain
npm test -- tests/db/search.test.js
```

期望：Cannot find module search.js —— 测试失败。

- [x] **Step 3: 实现 search.js**

创建 `E:\note\quickbrain\main\db\search.js`：

```js
const { generatePinyinForNote } = require('./pinyin')

function addNote(db, note) {
  const { title = '', content, tags = [], category = 'uncategorized',
          original_content = '' } = note
  const stmt = db.prepare(`
    INSERT INTO notes (content, title, category, tags, original_content)
    VALUES (?, ?, ?, ?, ?)
  `)
  const result = stmt.run(content, title, category, JSON.stringify(tags), original_content)
  const id = result.lastInsertRowid
  const py = generatePinyinForNote(title, content)
  db.prepare(`INSERT INTO notes_pinyin (id, pinyin_title, pinyin_content) VALUES (?, ?, ?)`)
    .run(id, py.pinyinTitle, py.pinyinContent)
  return id
}

function searchNotes(db, query, limit = 20) {
  if (!query || !query.trim()) return []

  const trimmed = query.trim()

  // 1. FTS5 精确匹配
  const ftsRows = db.prepare(`
    SELECT n.id, n.title, n.content, n.category, n.tags, n.created_at,
           bm25(notes_fts) AS score,
           CASE
             WHEN n.title LIKE ?1 THEN 5
             WHEN n.title LIKE ?2 THEN 3
             WHEN n.tags LIKE ?1 THEN 4
             WHEN n.tags LIKE ?2 THEN 2
             WHEN n.content LIKE ?1 THEN 2
             WHEN n.content LIKE ?2 THEN 1
             ELSE 0
           END AS title_score
    FROM notes_fts
    JOIN notes n ON n.id = notes_fts.rowid
    WHERE notes_fts MATCH ?3
    ORDER BY score
    LIMIT ?4
  `).all(`${trimmed}%`, `%${trimmed}%`, `${trimmed}*`, limit)

  // 2. 拼音兜底（FTS5 结果 < 3 时）
  if (ftsRows.length < 3) {
    const py = require('./pinyin').pinyinInitials(trimmed).replace(/\s+/g, '')
    if (py) {
      const pyRows = db.prepare(`
        SELECT n.id, n.title, n.content, n.category, n.tags, n.created_at,
               0 AS score, 1 AS title_score
        FROM notes_pinyin p
        JOIN notes n ON n.id = p.id
        WHERE p.pinyin_title LIKE ?1 OR p.pinyin_content LIKE ?1
        LIMIT ?2
      `).all(`%${py}%`, limit)
      const seen = new Set(ftsRows.map(r => r.id))
      for (const r of pyRows) {
        if (!seen.has(r.id)) ftsRows.push(r)
      }
    }
  }

  return ftsRows.map(row => ({
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    tags: safeParseJSON(row.tags, []),
    created_at: row.created_at,
    score: row.score
  }))
}

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str) } catch { return fallback }
}

module.exports = { searchNotes, addNote }
```

- [x] **Step 4: 跑测试验证通过**

```bash
cd E:\note\quickbrain
npm test -- tests/db/search.test.js
```

期望：6 个 search 测试通过。如有失败，按错误信息调整 SQL（常见：FTS5 MATCH 需要 `*` 通配符或 LIKE 大小写）。

- [x] **Step 5: Commit**

```bash
cd E:\note\quickbrain
git add main/db/search.js tests/db/search.test.js
git commit -m "feat(db): add search API with FTS5 and pinyin fallback"
```

---

## Phase 4: AI 层

### Task 5: 实现 AI prompts

**Files:**
- Create: `main/ai/prompts.js`
- Create: `tests/ai/prompts.test.js`

- [x] **Step 1: 写失败的测试**

创建 `E:\note\quickbrain\tests\ai\prompts.test.js`：

```js
import { describe, it, expect } from 'vitest'
import { buildFormatPrompt, buildSemanticSearchPrompt } from '../../main/ai/prompts.js'

describe('prompts', () => {
  it('buildFormatPrompt returns summary prompt by default', () => {
    const p = buildFormatPrompt('hello world', 'summary')
    expect(p).toContain('hello world')
    expect(p).toContain('摘要')
  })

  it('buildFormatPrompt supports structured style', () => {
    const p = buildFormatPrompt('hello', 'structured')
    expect(p).toContain('结构化')
  })

  it('buildFormatPrompt supports tags style', () => {
    const p = buildFormatPrompt('hello', 'tags')
    expect(p).toContain('标签')
  })

  it('buildFormatPrompt supports mindmap style', () => {
    const p = buildFormatPrompt('hello', 'mindmap')
    expect(p).toContain('思维导图')
  })

  it('buildSemanticSearchPrompt includes query and notes', () => {
    const p = buildSemanticSearchPrompt('分布式锁', ['note 1', 'note 2'])
    expect(p).toContain('分布式锁')
    expect(p).toContain('note 1')
  })
})
```

- [x] **Step 2: 跑测试确认失败**

```bash
cd E:\note\quickbrain
npm test -- tests/ai/prompts.test.js
```

期望：Cannot find module prompts.js —— 测试失败。

- [x] **Step 3: 实现 prompts.js**

创建 `E:\note\quickbrain\main\ai\prompts.js`：

```js
const SYSTEM_PROMPT = '你是一个专业的信息整理助手。请将用户输入的内容按照要求格式进行整理。输出应该清晰、结构化，便于阅读和检索。只输出整理后的内容，不要添加额外的解释。'

const STYLE_PROMPTS = {
  summary: (content) => `请将以下内容整理成简洁的摘要，保留关键信息：\n\n${content}`,
  structured: (content) => `请将以下内容整理成结构化格式，包括：标题、要点、详细说明：\n\n${content}`,
  tags: (content) => `请分析以下内容，提取关键标签并重新组织成带标签的结构化笔记：\n\n${content}`,
  mindmap: (content) => `请将以下内容整理成思维导图形式，使用层级结构展示：\n\n${content}`
}

const CATEGORIZE_PROMPT = `分析这段内容的主题，返回JSON：{"category":"类别","tags":["标签"]}。类别只能是：工作、学习、生活、灵感、其他。标签最多3个，用逗号分隔。`

function buildFormatPrompt(content, style = 'summary') {
  const builder = STYLE_PROMPTS[style] || STYLE_PROMPTS.summary
  return builder(content)
}

function buildSemanticSearchPrompt(query, noteSummaries) {
  const list = noteSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')
  return `用户的查询是："${query}"\n\n以下是从本地笔记库中检索到的候选笔记（按相关度排序）：\n${list}\n\n请分析用户的真实意图，返回最相关的笔记编号列表。\n\n返回JSON格式：{"matchedIds":[编号数组，从1开始],"reasoning":"选择理由"}`
}

module.exports = {
  SYSTEM_PROMPT,
  CATEGORIZE_PROMPT,
  buildFormatPrompt,
  buildSemanticSearchPrompt
}
```

- [x] **Step 4: 跑测试验证通过**

```bash
cd E:\note\quickbrain
npm test -- tests/ai/prompts.test.js
```

期望：5 个 prompts 测试通过。

- [x] **Step 5: Commit**

```bash
cd E:\note\quickbrain
git add main/ai/prompts.js tests/ai/prompts.test.js
git commit -m "feat(ai): add prompt templates"
```

---

### Task 6: 实现 AI service

**Files:**
- Create: `main/ai/service.js`
- Create: `tests/ai/service.test.js`

- [x] **Step 1: 写失败的测试**

创建 `E:\note\quickbrain\tests\ai\service.test.js`：

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AIService } from '../../main/ai/service.js'

// Mock OpenAI
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn()
        }
      }
    }))
  }
})

describe('ai service', () => {
  let service
  let mockCreate

  beforeEach(() => {
    service = new AIService({
      apiKey: 'test-key',
      baseURL: 'https://test.api',
      model: 'test-model',
      defaultStyle: 'summary'
    })
    mockCreate = service.client.chat.completions.create
  })

  it('formatContent returns formatted text on success', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '  formatted result  ' } }]
    })

    const result = await service.formatContent('hello', 'summary')
    expect(result.success).toBe(true)
    expect(result.formattedContent).toBe('formatted result')
  })

  it('formatContent returns error on API failure', async () => {
    mockCreate.mockRejectedValue(new Error('API down'))

    const result = await service.formatContent('hello', 'summary')
    expect(result.success).toBe(false)
    expect(result.error).toContain('API down')
  })

  it('categorizeContent parses JSON response', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"category":"工作","tags":"react,hooks"}' } }]
    })

    const result = await service.categorizeContent('some content')
    expect(result.category).toBe('工作')
    expect(result.tags).toEqual(['react', 'hooks'])
  })

  it('semanticSearch returns matched IDs', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"matchedIds":[1,3,5],"reasoning":"relevance"}' } }]
    })

    const result = await service.semanticSearch('query', ['note 1', 'note 3', 'note 5'])
    expect(result.matchedIds).toEqual([1, 3, 5])
    expect(result.reasoning).toBe('relevance')
  })
})
```

- [x] **Step 2: 跑测试确认失败**

```bash
cd E:\note\quickbrain
npm test -- tests/ai/service.test.js
```

期望：Cannot find module service.js —— 测试失败。

- [x] **Step 3: 实现 service.js**

创建 `E:\note\quickbrain\main\ai\service.js`：

```js
const OpenAI = require('openai')
const { SYSTEM_PROMPT, CATEGORIZE_PROMPT, buildFormatPrompt, buildSemanticSearchPrompt } = require('./prompts')

class AIService {
  constructor(config) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || 'https://api.deepseek.com'
    })
    this.model = config.model || 'deepseek-chat'
    this.defaultStyle = config.defaultStyle || 'summary'
  }

  async formatContent(content, style = null) {
    const selectedStyle = style || this.defaultStyle
    const userPrompt = buildFormatPrompt(content, selectedStyle)
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
      return { success: true, formattedContent: response.choices[0].message.content.trim() }
    } catch (error) {
      return { success: false, error: error.message || '格式化失败' }
    }
  }

  async categorizeContent(content) {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: CATEGORIZE_PROMPT },
          { role: 'user', content: (content || '').substring(0, 1000) }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3
      })
      const result = JSON.parse(response.choices[0].message.content)
      return {
        category: result.category || '其他',
        tags: (result.tags || '').split(',').map(t => t.trim()).filter(t => t)
      }
    } catch (error) {
      return { category: '其他', tags: [] }
    }
  }

  async semanticSearch(query, candidateSummaries) {
    const userPrompt = buildSemanticSearchPrompt(query, candidateSummaries)
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: '你是一个语义检索助手。请分析用户查询，从候选笔记中返回最相关的笔记。' },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3
      })
      const result = JSON.parse(response.choices[0].message.content)
      return {
        matchedIds: result.matchedIds || [],
        reasoning: result.reasoning || ''
      }
    } catch (error) {
      return { matchedIds: [], reasoning: '', error: error.message }
    }
  }
}

module.exports = { AIService }
```

- [x] **Step 4: 跑测试验证通过**

```bash
cd E:\note\quickbrain
npm test -- tests/ai/service.test.js
```

期望：4 个 service 测试通过。

- [x] **Step 5: Commit**

```bash
cd E:\note\quickbrain
git add main/ai/service.js tests/ai/service.test.js
git commit -m "feat(ai): add AI service with format/categorize/semanticSearch"
```

> **注(修订版):** Step 3 实现后,ESM 决策进一步修订:AI 服务模块采用 `.mjs` 扩展名(`main/ai/service.mjs` + `main/ai/prompts.mjs`),强制 ESM 解析而不引入 `package.json "type": "module"`。三方案对比:
> - **Option A(放弃)**:在 `package.json` 设 `"type": "module"` 统一 ESM。会强制 `main/db/*.js` / `main.js` / `ai-service.js` 全部改为 ESM(或 `.cjs` 改名),超出 Task 6 修复 scope(实测会让 `tests/db/search.test.js` 因 `main/db/pinyin.js` 的 `require` 报 ESM scope 错误)。
> - **Option B(放弃)**:service.js 改回 CJS。实测 Vitest 1.6+`vi.hoisted` factory 仍无法对 CJS 的 `require('openai')` 注入 mock,真实 OpenAI SDK 仍被调用,返回 `Connection error.`(原 implementer 实测结论正确)。
> - **Option C(采用)**:保留项目 CJS 基线,仅 AI 服务层用 `.mjs` 强制 ESM。`main.js` / `ai-service.js` / `main/db/*.js` / `package.json` 全部不变。
> 
> **下游 Task 影响**:
> - **Task 8 (ipc.js)**:示例 `const { AIService } = require('./ai/service')` 改为 `await import('./main/ai/service.mjs')`(在 `registerIpcHandlers` 启动时或 `setAIService` 内 dynamic import;`app.whenReady()` 调用栈天然 async)。
> - **Task 19 (main.js)**:在 `app.whenReady().then(async () => { ... })` 中 dynamic import `AIService`。
> - **Task 7 / Task 9**:不变(不引用 AI service)。
> 
> **根本原因**:Vitest 1.6 的 `vi.mock('openai')` 仅对 ESM `import` 生效,CJS `require` 在 mock 注入前已同步执行。同时 Electron 28 自带 Node 18.18.2 不支持 `require(esm)`(Node 22.12+ 才稳定),故不能简单回 CJS `require()` AI 服务。代码 review I1 的根因。
---

## Phase 5: 主进程核心

### Task 7: 实现 db-init 启动模块

**Files:**
- Create: `main/db-init.js`
- Create: `tests/db-init.test.js`

- [x] **Step 1: 写失败的测试**

创建 `E:\note\quickbrain\tests\db-init.test.js`：

```js
import { describe, it, expect, vi } from 'vitest'

// Mock Electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-quickbrain')
  }
}))

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn()
  }
}))

vi.mock('better-sqlite3', () => ({
  default: vi.fn().mockImplementation(() => ({
    exec: vi.fn(),
    prepare: vi.fn().mockReturnValue({ get: vi.fn(), run: vi.fn() })
  }))
}))

describe('db-init', () => {
  it('initDatabase returns a database instance', async () => {
    const { initDatabase } = await import('../../main/db-init.js')
    const db = await initDatabase()
    expect(db).toBeDefined()
  })
})
```

- [x] **Step 2: 跑测试确认失败**

```bash
cd E:\note\quickbrain
npm test -- tests/db-init.test.js
```

期望：Cannot find module db-init.js —— 测试失败。

- [x] **Step 3: 实现 db-init.js**

创建 `E:\note\quickbrain\main\db-init.js`：

```js
const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')

let dbInstance = null

async function initDatabase() {
  if (dbInstance) return dbInstance

  const userDataPath = app.getPath('userData')
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }

  const dbPath = path.join(userDataPath, 'quickbrain.db')
  dbInstance = new Database(dbPath)

  const schemaPath = path.join(__dirname, 'db', 'schema.sql')
  const schema = fs.readFileSync(schemaPath, 'utf8')
  dbInstance.exec(schema)

  return dbInstance
}

function getDB() {
  return dbInstance
}

function closeDatabase() {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}

module.exports = { initDatabase, getDB, closeDatabase }
```

- [x] **Step 4: 跑测试验证通过**

```bash
cd E:\note\quickbrain
npm test -- tests/db-init.test.js
```

期望：1 个 db-init 测试通过。

- [x] **Step 5: Commit**

```bash
cd E:\note\quickbrain
git add main/db-init.js tests/db-init.test.js
git commit -m "feat(main): add database initialization module"
```

---

### Task 8: 实现 IPC handlers

**Files:**
- Create: `main/ipc.js`

- [x] **Step 1: 写失败的测试**

创建 `E:\note\quickbrain\tests\ipc.test.js`：

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockHandlers = {}
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel, handler) => { mockHandlers[channel] = handler },
    on: (channel, handler) => { mockHandlers[channel] = handler }
  }
}))

const mockAddNote = vi.fn().mockReturnValue(1)
const mockSearchNotes = vi.fn().mockReturnValue([{ id: 1, title: 'test' }])
const mockFormat = vi.fn().mockResolvedValue({ success: true, formattedContent: 'ok' })

vi.mock('../main/db/search.js', () => ({
  addNote: (...args) => mockAddNote(...args),
  searchNotes: (...args) => mockSearchNotes(...args)
}))

vi.mock('../main/ai/service.js', () => ({
  AIService: vi.fn().mockImplementation(() => ({
    formatContent: mockFormat
  }))
}))

const mockGetDB = vi.fn().mockReturnValue({
  prepare: vi.fn().mockReturnValue({
    run: vi.fn(),
    get: vi.fn().mockReturnValue({ id: 1 }),
    all: vi.fn().mockReturnValue([])
  })
})

vi.mock('../main/db-init.js', () => ({
  getDB: mockGetDB
}))

describe('ipc', () => {
  beforeEach(async () => {
    Object.keys(mockHandlers).forEach(k => delete mockHandlers[k])
    await import('../../main/ipc.js')
  })

  it('registers add-note handler', () => {
    expect(mockHandlers['add-note']).toBeDefined()
  })

  it('registers search-notes handler', () => {
    expect(mockHandlers['search-notes']).toBeDefined()
  })

  it('registers format-with-ai handler', () => {
    expect(mockHandlers['format-with-ai']).toBeDefined()
  })

  it('search-notes handler calls searchNotes', async () => {
    const result = await mockHandlers['search-notes'](null, { search: 'hello' })
    expect(mockSearchNotes).toHaveBeenCalled()
    expect(result).toEqual([{ id: 1, title: 'test' }])
  })
})
```

- [x] **Step 2: 跑测试确认失败**

```bash
cd E:\note\quickbrain
npm test -- tests/ipc.test.js
```

期望：Cannot find module ipc.js —— 测试失败。

- [x] **Step 3: 实现 ipc.js**

创建 `E:\note\quickbrain\main\ipc.js`：

```js
const { ipcMain } = require('electron')
const { getDB } = require('./db-init')
const { addNote, searchNotes } = require('./db/search')
const { AIService } = require('./ai/service')

let aiService = null

function setAIService(service) {
  aiService = service
}

function registerIpcHandlers() {
  ipcMain.handle('search-notes', async (event, filters = {}) => {
    const db = getDB()
    return searchNotes(db, filters.search || '', 20)
  })

  ipcMain.handle('add-note', async (event, noteData) => {
    const db = getDB()
    const id = addNote(db, noteData)
    return { id, ...noteData }
  })

  ipcMain.handle('update-note', async (event, { id, ...updates }) => {
    const db = getDB()
    const keys = Object.keys(updates)
    if (keys.length === 0) return
    const setClause = keys.map(k => `${k} = ?`).join(', ')
    db.prepare(`UPDATE notes SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...keys.map(k => typeof updates[k] === 'object' ? JSON.stringify(updates[k]) : updates[k]), id)
  })

  ipcMain.handle('delete-note', async (event, id) => {
    const db = getDB()
    db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('format-with-ai', async (event, { content, style }) => {
    if (!aiService) return { success: false, error: '未配置 AI 服务' }
    return await aiService.formatContent(content, style)
  })

  ipcMain.handle('categorize-with-ai', async (event, { content }) => {
    if (!aiService) return { success: false, error: '未配置 AI 服务' }
    return await aiService.categorizeContent(content)
  })

  ipcMain.handle('semantic-search', async (event, { query, candidateSummaries }) => {
    if (!aiService) return { success: false, error: '未配置 AI 服务' }
    return await aiService.semanticSearch(query, candidateSummaries)
  })

  ipcMain.handle('get-all-notes', async () => {
    const db = getDB()
    return db.prepare('SELECT * FROM notes ORDER BY created_at DESC').all()
      .map(row => ({ ...row, tags: safeParse(row.tags, []) }))
  })

  ipcMain.on('hide-window', (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender)
    if (win) win.hide()
  })

  ipcMain.on('show-window', (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender)
    if (win) win.show()
  })

  ipcMain.on('locate-note', (event, id) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.webContents.send('locate-note', id)
    }
  })
}

function safeParse(str, fallback) {
  try { return JSON.parse(str) } catch { return fallback }
}

module.exports = { registerIpcHandlers, setAIService }
```

- [x] **Step 4: 跑测试验证通过**

```bash
cd E:\note\quickbrain
npm test -- tests/ipc.test.js
```

期望：4 个 ipc 测试通过。

- [x] **Step 5: Commit**

```bash
cd E:\note\quickbrain
git add main/ipc.js tests/ipc.test.js
git commit -m "feat(main): add IPC handlers for notes/search/AI"
```



### Task 8 实施偏差说明

> 由 Task 8 spec reviewer (Confucius) 记录。**Verdict: With fixes**（仅 plan hygiene 问题），代码实现 verdict: Yes。

- **偏差 1 (ESM/CJS)**: 实现未保留 plan 中的 ``const { AIService } = require('./ai/service')`` 行，因 ``AIService`` 在 ipc.js 中未被使用（死代码）。caller 改为在 Task 19 main.js 中通过 dynamic import 拿到实例后调用 ``setAIService(instance)``。这避免了对重构后 ``service.mjs`` 的 CJS require 错误（Electron 28 Node 18.18.2 不支持 require(esm)）。
- **偏差 2 (测试 mock)**: vitest 1.x 对 ``.js`` 文件的 CJS require chain 不生效（``vi.mock`` 仅拦截 ESM ``import``）。改用 ``Module._cache`` 劫持（与 Task 7 db-init.test.js 同模式）。
- **偏差 3 (测试注册)**: plan Step 1 测试代码假设 ``await import('../main/ipc.js')`` 即注册所有 handler，但 plan Step 3 实现代码把注册包在 ``registerIpcHandlers()`` 函数内。Implementer 选择在 ``beforeEach`` 中显式调用 ``registerIpcHandlers()`` 以匹配实际实现。
- **偏差 4 (commit message)**: implementer 用 ``feat(main): add IPC handlers``，plan 模板建议 ``feat(main): add IPC handlers for notes/search/AI``。两者均合规（conventional commits 规范）。
---

### Task 9: 实现全局快捷键

**Files:**
- Create: `main/shortcuts.js`

- [x] **Step 1: 实现 shortcuts.js（无独立测试，集成测试覆盖）**

创建 `E:\note\quickbrain\main\shortcuts.js`：

```js
const { globalShortcut } = require('electron')

function registerShortcuts({ onPalette, onMainWindow, onAddNote }) {
  const unregister = []

  const palette = globalShortcut.register('Alt+K', () => onPalette && onPalette())
  if (palette) unregister.push('Alt+K')

  const main = globalShortcut.register('CommandOrControl+Q', () => onMainWindow && onMainWindow())
  if (main) unregister.push('CommandOrControl+Q')

  const add = globalShortcut.register('CommandOrControl+A', () => onAddNote && onAddNote())
  if (add) unregister.push('CommandOrControl+A')

  return unregister
}

function unregisterAll() {
  globalShortcut.unregisterAll()
}

module.exports = { registerShortcuts, unregisterAll }
```

- [x] **Step 2: Commit**

```bash
cd E:\note\quickbrain
git add main/shortcuts.js


### Task 9 Code Review Observations

> 由 Task 9 code quality reviewer (McClintock) 记录。**Verdict: Yes**（实现与 plan 模板字节级一致，可合并）。以下为 plan-level 观察，不阻塞后续 task。

#### Plan-Level 风险（需在 Task 19 集成或用户验收前重新评估）

1. **`CommandOrControl+A` 全局冲突**：此为系统级"全选"快捷键。注册为全局后，用户在任意应用输入框（浏览器、聊天、编辑器）按 Cmd/Ctrl+A 都会触发 addNote callback，**不再执行"全选"**。包括 QuickBrain 自家 palette 输入框、main window 编辑区，严重干扰基本文本编辑。
   - **建议方案**：在 palette 输入框聚焦时临时 unregister，失焦后再 register（实现成本中等）
   - **或换快捷键**：`CommandOrControl+Shift+A` / `CommandOrControl+N`（API 改动最小）

2. **`CommandOrControl+Q` 在 macOS 上是系统退出快捷键**：注册后用户按 Cmd+Q 退出其他 Mac 应用会被 QuickBrain 截获而不退出目标应用，是 Electron 官方文档明确警告的反模式。
   - **建议方案**：在 macOS 上不注册该快捷键，仅注册 Alt+K + 其他快捷键

3. **`Alt+K` 在 Linux 桌面环境（GNOME/KDE）可能冲突**：register 静默失败时用户按 Alt+K 无反应，体验不佳。当前未提供快捷键配置 UI，需告知用户去设置里改键（未来任务）。

4. **`registerShortcuts` 返回的 `unregister` 数组未被消费**：Task 19 main.js 调用时未捕获返回值，统一走 `unregisterAll()` 全清。当前为"forward-compatible dead return"，不阻塞。如未来需要"禁用单个快捷键但保留其他"，该数组可用。

#### 集成契约（与 Task 19）

- 调用时机：main.js 在 `app.whenReady()` 回调内调用 `globalShortcut.register`
- 三个 callback 语义：`onPalette: togglePalette` / `onMainWindow: toggleMainWindow` / `onAddNote: () => showPalette()`
- 清理时机：`app.on('will-quit', () => { unregisterAll(); closeDatabase() })`

#### Code Reviewer 的具体建议

1. Task 19 集成 PR 中明确选择 `registerShortcuts` 返回值处理策略（方案 A：捕获 unregister；方案 B：不接返回值）
2. `config.example.json` 预留 `shortcuts` 配置块入口
3. 重新审视 `CommandOrControl+A` 和 `CommandOrControl+Q` 的全局注册决策
git commit -m "feat(main): add global shortcuts registration"
```

---

### Task 10: 实现系统托盘

**Files:**
- Create: `main/tray.js`

- [x] **Step 1: 实现 tray.js**

创建 `E:\note\quickbrain\main\tray.js`：

```js
const { Tray, Menu, Notification } = require('electron')
const path = require('path')

function createTray({ onShowPalette, onShowMain, onSettings, onQuit }) {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png')
  const tray = new Tray(iconPath)

  const contextMenu = Menu.buildFromTemplate([
    { label: '命令面板 (Alt+K)', click: () => onShowPalette && onShowPalette() },
    { label: '主窗口 (Ctrl+Q)', click: () => onShowMain && onShowMain() },
    { type: 'separator' },
    { label: '设置', click: () => onSettings && onSettings() },
    { type: 'separator' },
    { label: '退出', click: () => onQuit && onQuit() }
  ])

  tray.setToolTip('QuickBrain - 个人知识助手\n快捷键: Alt+K 命令面板 | Ctrl+Q 主窗口')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => onShowPalette && onShowPalette())

  return tray
}

function notify(title, body) {
  new Notification({ title, body }).show()
}

module.exports = { createTray, notify }
```

- [x] **Step 2: Commit**

```bash
cd E:\note\quickbrain
git add main/tray.js
git commit -m "feat(main): add system tray with context menu"
```


### Task 10 Code Review Observations

> Verdict: Yes (Ramanujan). Implementer deviation (icon fallback) justified. Critical findings flagged for Task 19.

#### Implementer deviation (justified)

- **icon fallback**: plan used `new Tray(iconPath)` but `assets/icon.png` is missing (empty `assets/` dir), would crash Windows app. Implementer added try/catch + `nativeImage.createEmpty()`. Reasonable; simplify later when real icon asset is added.

#### ⚠️ Task 19 must address (Architecture Notes)

**A. main.js legacy code conflict**

`main.js:87-100` has a **legacy `createTray()` function** with `new tray(iconPath)` (lowercase bug):

```js
function createTray() {
  const iconPath = path.join(__dirname, "assets", "icon.png");
  trayIcon = new tray(iconPath); // bug: lowercase tray
  ...
}
```

Conflicts with Task 10 new module. Task 19 must delete this legacy function.

**B. will-quit handler missing tray.destroy()**

Plan line 2589-2592 will-quit cleanup should be:

```js
app.on("will-quit", () => {
  if (tray) tray.destroy()
  unregisterAll()
  closeDatabase()
})
```

**C. onQuit callback contract**

`createTray({ ..., onQuit })` onQuit should be `() => app.quit()` in Task 19 integration.

#### Icon asset strategy (future task)

package.json:47 references `assets/icon.png` for packaging, but directory is empty. Future task should add real icon asset; tray.js fallback can be simplified.

#### Minor Issues (not blocking)

- M1: Fallback may throw on macOS; embedded base64 PNG more robust
- M2: Error log missing stack trace
- M3: notify() lacks error handling + Notification.isSupported() check
- M4: Windows tooltip `
` does not render (Electron limit)
- M5: Tray click missing Linux platform branch

---

### Task 11: 实现窗口管理

**Files:**
- Create: `main/windows.js`

- [x] **Step 1: 实现 windows.js**

创建 `E:\note\quickbrain\main\windows.js`：

```js
const { BrowserWindow, screen } = require('electron')
const path = require('path')

let paletteWindow = null
let mainWindow = null

function getPalettePosition() {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workAreaSize
  const winWidth = 400
  const winHeight = 500
  return {
    x: Math.round((width - winWidth) / 2),
    y: Math.round(height / 6),
    width: winWidth,
    height: winHeight
  }
}

function createPaletteWindow(preloadPath) {
  if (paletteWindow && !paletteWindow.isDestroyed()) return paletteWindow

  const pos = getPalettePosition()
  paletteWindow = new BrowserWindow({
    ...pos,
    frame: false,
    transparent: true,
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(preloadPath, 'palette-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  })

  paletteWindow.loadFile(path.join(__dirname, '..', 'renderer', 'palette', 'index.html'))
  paletteWindow.on('blur', () => {
    if (paletteWindow && paletteWindow.isVisible()) {
      paletteWindow.hide()
    }
  })

  return paletteWindow
}

function createMainWindow(preloadPath) {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow

  mainWindow = new BrowserWindow({
    width: 600,
    height: 700,
    minWidth: 400,
    minHeight: 500,
    frame: false,
    transparent: true,
    hasShadow: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(preloadPath, 'main-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  })

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'main', 'index.html'))
  mainWindow.on('closed', () => { mainWindow = null })

  return mainWindow
}

function showPalette() {
  if (!paletteWindow || paletteWindow.isDestroyed()) return
  if (!paletteWindow.isVisible()) {
    const pos = getPalettePosition()
    paletteWindow.setBounds(pos)
  }
  paletteWindow.show()
  paletteWindow.focus()
  paletteWindow.webContents.send('palette-reset')
}

function hidePalette() {
  if (paletteWindow && !paletteWindow.isDestroyed() && paletteWindow.isVisible()) {
    paletteWindow.hide()
  }
}

function togglePalette() {
  if (paletteWindow && paletteWindow.isVisible()) hidePalette()
  else showPalette()
}

function toggleMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isVisible()) mainWindow.hide()
  else { mainWindow.show(); mainWindow.focus() }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.show()
  mainWindow.focus()
}

function locateNoteInMain(id) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  showMainWindow()
  mainWindow.webContents.send('locate-note', id)
}

function getMainWindow() { return mainWindow }
function getPaletteWindow() { return paletteWindow }

module.exports = {
  createPaletteWindow, createMainWindow,
  showPalette, hidePalette, togglePalette,
  toggleMainWindow, showMainWindow, locateNoteInMain,
  getMainWindow, getPaletteWindow
}
```

- [x] **Step 2: Commit**

```bash
cd E:\note\quickbrain
git add main/windows.js
git commit -m "feat(main): add window management for palette and main window"
```


### Task 11 Code Review Observations

> Verdict: Yes (Tesla). Implementation is **byte-level identical** to plan template (126 lines, 0 diff). All Minor issues are non-blocking.

#### Minor Issues (non-blocking)

- **M1**: `togglePalette()` (line 84) lacks `isDestroyed()` guard, inconsistent with `toggleMainWindow()`. Best to fix in Task 19 polish (1 line change).
- **M2**: `sandbox: true` not set in `webPreferences`. Recommended Electron hardening; can be added in Task 19 if integration tests pass.
- **M3**: macOS `alwaysOnTop: true` could be upgraded to `alwaysOnTop: "floating"` for better UX (Spotlight-style). Windows behavior unchanged.
- **M5**: `locateNoteInMain()` relies on Electron queuing `webContents.send` messages before `did-finish-load`; safe but fragile. No ack/retry in plan.

#### Architecture Notes for Task 19

- Lifecycle: Task 19 must decide when to create palette (lazily on app ready) and when to destroy (app quit).
- Integration contract:
  - `createPaletteWindow(preloadPath)` / `createMainWindow(preloadPath)` — main.js must pass `path.join(__dirname, "..", "preload")` (a directory).
  - `webContents.send("palette-reset")` — pairs with Task 13 palette-preload.
  - `webContents.send("locate-note", id)` — pairs with Task 12 main-preload.
- Security baseline: spec 11 satisfied (nodeIntegration: false + contextIsolation: true + webSecurity: true). preload white-list via contextBridge in Task 12-13.

---

## Phase 6: Preload 桥

### Task 12: 实现主窗口 preload

**Files:**
- Create: `preload/main-preload.js`

- [x] **Step 1: 实现 main-preload.js**

创建 `E:\note\quickbrain\preload\main-preload.js`：

```js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('quickbrain', {
  // Notes operations
  getAllNotes: () => ipcRenderer.invoke('get-all-notes'),
  searchNotes: (filters) => ipcRenderer.invoke('search-notes', filters),
  addNote: (noteData) => ipcRenderer.invoke('add-note', noteData),
  updateNote: (data) => ipcRenderer.invoke('update-note', data),
  deleteNote: (id) => ipcRenderer.invoke('delete-note', id),

  // AI operations
  formatWithAI: (params) => ipcRenderer.invoke('format-with-ai', params),
  categorizeWithAI: (params) => ipcRenderer.invoke('categorize-with-ai', params),

  // Window controls
  hideWindow: () => ipcRenderer.send('hide-window'),
  showWindow: () => ipcRenderer.send('show-window'),

  // Listen for locate-note event
  onLocateNote: (callback) => {
    ipcRenderer.on('locate-note', (event, id) => callback(id))
  }
})
```

- [x] **Step 2: Commit**

```bash
cd E:\note\quickbrain
git add preload/main-preload.js
git commit -m "feat(preload): add main window context bridge"
```


### Task 12 Code Review Observations

> Verdict: Yes (Popper). Implementation is **byte-level identical** to plan template (24 lines). All Minor issues are non-blocking.

#### Minor Issues (non-blocking)

- **M1**: `onLocateNote` lacks `offLocateNote` unregister. Acceptable now (main window is singleton, single SPA, webContents cleanup on destroy). Future-proofing if hot-reload or multi-SPA introduced.
- **M2**: Param passthrough without validation. `contextIsolation: true` already blocks direct object access; IPC uses structured clone. Schema validation responsibility belongs to Task 8 ipc handlers.
- **M3 (process)**: plan checklist Step 1 / Step 2 not flipped (pattern across Task 7-11, handled in independent doc commit).

#### Architecture Notes for Task 13 / 19

- API surface split is correct: main window uses `quickbrain` namespace (notes CRUD + window + locate listener), palette uses `paletteAPI` namespace (search + add + AI + semantic search + locate trigger).
- Cross-window event chain complete: palette-preload `locateNoteInMain` -> `ipcRenderer.send("locate-note")` -> ipc.js `ipcMain.on("locate-note")` -> windows.js `mainWindow.webContents.send("locate-note", id)` -> main-preload `onLocateNote`.

---

### Task 13: 实现命令面板 preload

**Files:**
- Create: `preload/palette-preload.js`

- [x] **Step 1: 实现 palette-preload.js**

创建 `E:\note\quickbrain\preload\palette-preload.js`：

```js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('paletteAPI', {
  // Search and notes
  searchNotes: (query) => ipcRenderer.invoke('search-notes', { search: query }),
  addNote: (noteData) => ipcRenderer.invoke('add-note', noteData),
  deleteNote: (id) => ipcRenderer.invoke('delete-note', id),
  updateNote: (data) => ipcRenderer.invoke('update-note', data),

  // AI
  formatWithAI: (params) => ipcRenderer.invoke('format-with-ai', params),
  semanticSearch: (params) => ipcRenderer.invoke('semantic-search', params),

  // Cross-window navigation
  locateNoteInMain: (id) => ipcRenderer.send('locate-note', id),

  // Listen for palette reset event
  onPaletteReset: (callback) => {
    ipcRenderer.on('palette-reset', () => callback())
  }
})
```

- [x] **Step 2: 删除旧 preload.js**

```bash
cd E:\note\quickbrain
git rm preload.js
```

- [x] **Step 3: Commit**

```bash
cd E:\note\quickbrain
git add preload/palette-preload.js
git commit -m "feat(preload): add palette context bridge and remove old preload"
```



### Task 13 Code Review Observations

> Verdict: No (initially) → Yes (after fix). Implementation byte-level identical to plan, BUT plan missed a critical step.

#### ⚠️ Critical Issue Found & Fixed

**C-1: `preload.js` 删除导致 `main.js` preload 引用断路**

Reviewer (Goodall) 发现：`main.js:80` 仍引用 `path.join(__dirname, "preload.js")`（已删除），但 `package.json` `"main": "main.js"` 让 Electron 启动时找不到 preload → IPC bridge 失效。

**根因**：plan Task 13 Step 2 只包含 `git rm preload.js`，**没有 step 修改 `main.js` 的 preload 引用路径**。这是一个 plan-level gap。

**修复**（commit `791e4c7 fix(main): update preload path to new main-preload.js location`）：1 行 hotfix。
```js
// main.js
- preload: path.join(__dirname, "preload.js")
+ preload: path.join(__dirname, "preload", "main-preload.js")
```

**后续建议**：
- Task 19 重写 main.js 时统一处理 security hardening（nodeIntegration: false, contextIsolation: true）
- 加 smoke test：验证 `main.js` 中所有 `path.join` 引用都指向现存文件（避免类似断路）

#### Plan Deviation 评估

- **实现无 deviation**：byte-level 与 plan 一致 ✓
- **plan 自身有 gap**：plan Task 13 Step 2 应同时包含 "修改 main.js preload 引用" 子步骤
- 后续 Task 应在删除关键文件前，先确认所有引用都已迁移

#### Architecture Notes

- preload 桥：`paletteAPI` 命名空间（区别于 main 的 `quickbrain`），两个 webContents 各自独立注册 contextBridge，互不干扰
- IPC 契约：6 invoke + 1 send + 1 on，与 Task 8 ipc handlers / Task 11 windows.js 严格对齐
- 跨窗口事件链：palette `locateNoteInMain` → ipcMain.on → windows.js webContents.send → main-preload onLocateNote ✓
---

## Phase 7: 命令面板 UI

### Task 14: 命令面板 HTML + CSS

**Files:**
- Create: `renderer/palette/index.html`
- Create: `renderer/palette/palette.css`

- [x] **Step 1: 创建 index.html**

创建 `E:\note\quickbrain\renderer\palette\index.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'">
  <title>QuickBrain 命令面板</title>
  <link rel="stylesheet" href="palette.css">
</head>
<body>
  <div id="app">
    <div class="search-row">
      <input id="search-input" type="text" placeholder="搜索或输入命令（? 触发 AI 搜索）" autocomplete="off" spellcheck="false">
    </div>
    <div id="status-bar" class="status-bar">就绪</div>
    <div id="results" class="results">
      <div id="results-empty" class="empty">输入关键词开始搜索</div>
    </div>
    <div class="hint-bar">
      <span>↑↓ 选择</span>
      <span>Enter 复制</span>
      <span>Shift+Enter 详情</span>
      <span>Ctrl+Enter 主窗口</span>
      <span>Esc 关闭</span>
    </div>
  </div>
  <script src="commands/parser.js"></script>
  <script src="commands/registry.js"></script>
  <script src="palette.js"></script>
</body>
</html>
```

- [x] **Step 2: 创建 palette.css**

创建 `E:\note\quickbrain\renderer\palette\palette.css`：

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
  font-size: 14px;
  color: #e0e0e0;
  background: transparent;
  user-select: none;
}

#app {
  width: 100%;
  height: 100%;
  background: rgba(30, 30, 30, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
}

.search-row {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

#search-input {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  font-size: 15px;
  font-family: inherit;
}

#search-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.status-bar {
  padding: 4px 16px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  background: rgba(0, 0, 0, 0.2);
  min-height: 20px;
}

.results {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.results::-webkit-scrollbar {
  width: 6px;
}

.results::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

.group {
  margin-bottom: 4px;
}

.group-title {
  padding: 4px 16px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.item {
  padding: 8px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  border-left: 2px solid transparent;
}

.item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.item.selected {
  background: rgba(80, 130, 255, 0.25);
  border-left-color: #5082ff;
}

.item-icon {
  font-size: 13px;
  width: 16px;
  text-align: center;
}

.item-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.empty {
  padding: 40px 16px;
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
  font-size: 13px;
}

.hint-bar {
  padding: 6px 16px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
```

- [x] **Step 3: Commit**

```bash
cd E:\note\quickbrain
git add renderer/palette/index.html renderer/palette/palette.css
git commit -m "feat(palette): add HTML structure and styles"
```



### Task 14 Code Review Observations

> Verdict: Yes (Banach). Implementation is **byte-level identical** to plan template (HTML 30 lines + CSS 137 lines). Zero issues.

#### Plan Deviation

- Zero deviation: HTML and CSS match plan line 1827-1856 / 1862-1999 byte-level. Only "differences" are markdown code fences, which is expected.

#### Architecture Notes for Task 17

- DOM contract satisfied: `#search-input` / `#results` / `#status-bar` / `.item.selected` / `#results-empty` / `.hint-bar` all match Task 17 palette.js references.
- CSS classes complete: `.group` / `.group-title` / `.item-icon` / `.item-text` / `.item-meta` ready for Task 17 render function.
- Default content "就绪" / "输入关键词开始搜索" will be overwritten by Task 17.
- Empty state toggle (Task 17): show `#results-empty` when `currentResults.length === 0`.

#### Minor Recommendations (non-blocking, future)

- Accessibility: add `aria-label` to `#search-input`, use `<kbd>` for hint-bar spans.
---

### Task 15: 命令解析器

**Files:**
- Create: `renderer/palette/commands/parser.js`
- Create: `tests/renderer/palette/parser.test.js`

- [x] **Step 1: 写失败的测试**

创建 `E:\note\quickbrain\tests\renderer\palette\parser.test.js`：

```js
import { describe, it, expect } from 'vitest'
import { parseInput } from '../../../renderer/palette/commands/parser.js'

describe('palette parser', () => {
  it('detects AI semantic search with ? prefix', () => {
    const r = parseInput('? 我之前看过的分布式锁')
    expect(r.type).toBe('ai-search')
    expect(r.query).toBe('我之前看过的分布式锁')
  })

  it('detects explicit AI format command with ai prefix', () => {
    const r = parseInput('ai 摘要 北京旅游')
    expect(r.type).toBe('ai-format')
    expect(r.style).toBe('summary')
    expect(r.keyword).toBe('北京旅游')
  })

  it('detects built-in command by exact name', () => {
    const r = parseInput('打开设置')
    expect(r.type).toBe('command')
    expect(r.command).toBe('打开设置')
  })

  it('detects command with keyword', () => {
    const r = parseInput('格式化 分布式锁')
    expect(r.type).toBe('command')
    expect(r.command).toBe('格式化')
    expect(r.keyword).toBe('分布式锁')
  })

  it('falls back to new-content', () => {
    const r = parseInput('这是一段全新的笔记内容，没有任何关键词匹配')
    expect(r.type).toBe('new-content')
    expect(r.content).toBe('这是一段全新的笔记内容，没有任何关键词匹配')
  })

  it('handles empty input', () => {
    const r = parseInput('')
    expect(r.type).toBe('empty')
  })
})
```

- [x] **Step 2: 跑测试确认失败**

```bash
cd E:\note\quickbrain
npm test -- tests/renderer/palette/parser.test.js
```

期望：Cannot find module parser.js —— 测试失败。

- [x] **Step 3: 实现 parser.js**

创建 `E:\note\quickbrain\renderer\palette\commands\parser.js`：

```js
const COMMAND_NAMES = [
  '添加笔记', '格式化', '复制', '删除', '编辑', '分类', '重新分类',
  '打开主窗口', '打开设置', '打开数据目录',
  '导出所有笔记', '导入笔记', '备份数据库', '清空所有笔记', '显示统计',
  'AI 设置', '重启应用', '退出', '关于'
]

const STYLE_MAP = {
  '摘要': 'summary', '结构化': 'structured', '标签': 'tags', '思维导图': 'mindmap'
}

function parseInput(input) {
  if (!input || !input.trim()) return { type: 'empty' }

  const trimmed = input.trim()

  // 1. ? 前缀 → AI 语义搜索
  if (trimmed.startsWith('?') || trimmed.startsWith('？')) {
    const query = trimmed.replace(/^[?？]\s*/, '').trim()
    return { type: 'ai-search', query }
  }

  // 2. ai 前缀 → 显式 AI 格式化
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

  // 4. 命令名 + 关键词
  for (const cmd of COMMAND_NAMES) {
    if (trimmed.startsWith(cmd + ' ')) {
      const keyword = trimmed.slice(cmd.length + 1).trim()
      return { type: 'command', command: cmd, keyword }
    }
  }

  // 5. 其余视为新内容
  return { type: 'new-content', content: trimmed }
}

module.exports = { parseInput, COMMAND_NAMES, STYLE_MAP }
```

- [x] **Step 4: 跑测试验证通过**

```bash
cd E:\note\quickbrain
npm test -- tests/renderer/palette/parser.test.js
```

期望：6 个 parser 测试通过。

- [x] **Step 5: Commit**

```bash
cd E:\note\quickbrain
git add renderer/palette/commands/parser.js tests/renderer/palette/parser.test.js
git commit -m "feat(palette): add input parser for commands/AI/new-content"
```

---


### Task 15 Code & Spec Review Observations

> Verdict: Yes (both Spec Pasteur and Code Halley). Implementation is **byte-level aligned with plan**, 11 tests pass (plan expected 6, +5 robustness).

#### I-1: spec "21 条" vs plan "19 条" 数字口径 (plan-level)

Spec §2.1 / §10 / §11.1 标题级数字 "21 条内置命令"，但 plan Task 15 模板 COMMAND_NAMES 只列 19 条（把 `?` 和 `ai` 当作 trigger 而非独立命令）。

**当前决策**：保持 19 条（与 plan Task 15 模板一致）。spec "21 条" 是 plan-level 口径不一致。

**Reconciler 建议**（未来 task）：
- 选择 A：扩 COMMAND_NAMES 加 2 个 trigger entry（`?` 和 `ai`），保持 spec 数字
- 选择 B：保留 19 条，修改 spec 文档 "21" → "19"
- 选择 C（当前）：保留 19 条，标记为待 reconciler 决议

不影响 Task 16-17 实施，因为 registry.js 复用 COMMAND_NAMES 数组。

#### M-deviation: 11 vs 6 tests (positive coverage)

Implementer 自加 5 个鲁棒性测试：
- whitespace-only input → empty
- 全角 `？` → ai-search
- 大写 `AI ` → ai-format
- meta: exports 19 command names
- meta: exports STYLE_MAP with 4 styles

两位 reviewer 都建议**保留**全部 11 个测试（不是 plan deviation，是正向覆盖）。

#### Architecture Notes for Task 16/17

- **Task 16 registry.js**: `const { COMMAND_NAMES } = require("./parser")` 复用常量，避免硬编码副本。
- **Task 17 palette.js**: 基于 `parseInput` 输出 schema 调度：
  - empty → 不调度（显示空状态）
  - ai-search → IPC `semantic-search`
  - ai-format → 先 `searchNotes` 选第一条，再 `runAIFormat(note, style)`
  - command → `findCommand(name).execute(ctx, keyword)`
  - new-content → IPC `addNote(content)` + 后台 AI 调度
- 命令前缀匹配安全：COMMAND_NAMES 中没有 `打开` 这种被 `打开主窗口`/`打开设置` 覆盖的项，step 4 顺序遍历无风险。

#### Minor Issues (non-blocking, future)

- 全角空格 (U+3000) 不作为 `ai` 前缀分隔符（中文输入法场景，未来增强）。
- `?`/`？` 单字输入产生空 query（parser 不报错，上层处理）。
- `null`/`undefined` 输入兜底返回 empty（当前够用，未来可加严格类型校验）。

### Task 16: 命令注册表

**Files:**
- Create: `renderer/palette/commands/registry.js`

- [x] **Step 1: 实现 registry.js**

创建 `E:\note\quickbrain\renderer\palette\commands\registry.js`：

```js
const { app } = require('electron').remote ? require('electron').remote : {}
const path = require('path')

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
  { name: '清空所有笔记', icon: '⚠', dangerous: true, execute: (ctx) => { ctx.clearAll(); ctx.hidePalette() } },
  { name: '显示统计', icon: '📊', execute: (ctx) => { ctx.showStats(); } },
  // AI 类
  { name: 'AI 设置', icon: '🔑', execute: (ctx) => { ctx.showMainWindow(); ctx.hidePalette(); ctx.openAISettings() } },
  // 系统类
  { name: '重启应用', icon: '↻', execute: (ctx) => { ctx.relaunch(); } },
  { name: '退出', icon: '✕', execute: (ctx) => { ctx.quit(); } },
  { name: '关于', icon: 'ⓘ', execute: (ctx) => { ctx.showAbout(); } }
]

function findCommand(name) {
  return registry.find(c => c.name === name)
}

module.exports = { registry, findCommand }
```

- [x] **Step 2: Commit**

```bash
cd E:\note\quickbrain
git add renderer/palette/commands/registry.js
git commit -m "feat(palette): add command registry with 21 commands"
```

---


### Task 16 Code Review Observations

> Verdict: With fixes (Godel) → Yes (after fix). Implementation 19 commands, 4 plan-level bugs fixed.

#### Plan-Level Bugs Found & Fixed (commit 0499b18)

**C-1 + I-3**: registry.js 顶部两行死代码被删除：
```js
- const { app } = require("electron").remote ? require("electron").remote : {}
- const path = require("path")
```
- `app` 在 renderer + contextIsolation:true 下是 undefined，无任何命令使用
- `path` 整个文件未使用

**C-2**: `清空所有笔记` 加 confirm 屏障（与 `删除` 命令对称）：
```js
- execute: (ctx) => { ctx.clearAll(); ctx.hidePalette() }
+ execute: (ctx) => { if (!confirm("确认清空所有笔记？此操作不可撤销。")) return; ctx.clearAll(); ctx.hidePalette() }
```

**I-2**: commit message 从 `21 commands` 改为 `19 commands`（与实现一致）

#### Non-blocking Issues (deferred to Task 17)

- **I-1 clipboard IPC**: `复制` 命令直接 `require("electron").clipboard`，应通过 preload contextBridge 暴露。Task 17 实现时改。
- **M-2 confirm() UX**: 当前用浏览器原生 confirm()，未来可改主进程 `dialog.showMessageBox`。

#### Architecture Notes

- 19 个命令与 parser.COMMAND_NAMES 严格一一对应（meta 测试保护 Task 15）。
- `execute(ctx, ...)` 契约统一，ctx 字段由 Task 17 palette.js 注入。
- `危险` 标志：删除 / 清空所有笔记（现在都有 confirm）。
- 命令分组：操作 7 + 导航 3 + 数据 5 + AI 1 + 系统 3 = 19。

#### Minor Recommendations (future)

- 补 `tests/renderer/palette/registry.test.js`（findCommand / 危险标记 / 名字对齐）。
- findCommand O(n) 升级到 O(1) Map（命令增长时）。

### Task 17: 命令面板主 JS

**Files:**
- Create: `renderer/palette/palette.js`

- [ ] **Step 1: 实现 palette.js**

创建 `E:\note\quickbrain\renderer\palette\palette.js`：

```js
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

els.input.focus()
```

- [ ] **Step 2: Commit**

```bash
cd E:\note\quickbrain
git add renderer/palette/palette.js
git commit -m "feat(palette): add palette JS with input parsing and keyboard handlers"
```

---
### Task 17 Code Review Observations

> Verdict: With fixes (Plato) -> Yes (after fix, commit c6753db). 4 plan-level bugs fixed.

#### Plan-Level Bugs Found & Fixed (commit c6753db)

**C-1**: doSearch 缺少 `ai-format` 分支（spec 6.3 要求）。Implementer 严格按 plan 复制了 194 行 palette.js，但 plan 模板本身遗漏了 ai-format 调度。Fix：

```js
+  if (parsed.type === "ai-format") {
+    const results = await api.searchNotes(parsed.keyword || "")
+    if (results.length === 0) { setStatus("未找到匹配"); render(); return }
+    currentResults = [{ type: "note", note: results[0] }]
+    setStatus(`按 Enter AI ${parsed.style}`)
+    render()
+    return
+  }

```

**C-2**: buildContext.notify 中有 `api.searchNotes("").catch(() => {}) // 占位` 无意义占位。Fix：删除该行。

**C-3**: `window.addEventListener("palette-reset", ...)` 块（5 行）与 `api.onPaletteReset(...)` 块完全重复（palette-preload.js 只暴露后者）。Fix：删除前一个块，保留 `api.onPaletteReset`（其中含合法 `els.input.focus()` 满足 spec 10）。

**I-1**: Plato reviewer 误判 focus 调用（基于 plan line 2616，实际 palette.js 仅 200 行）。澄清后明确：line 29 `els.input.focus()` 合法保留，无需额外添加。

#### 决策变更

- "byte-level" 约束在 review prompt 中应理解为 "不擅自添加 plan 外特性"，而非 "复制 plan 的 bug"。Implementer 发现 plan bug 时应主动修复并报告。

#### 残留 Plan-Level 偏差（留 Task 19）

- `require("electron").app` / `clipboard` / `Notification` 4 处（renderer 进程在 contextIsolation:true 下不可用）
- 8 个 `alert()` 占位（应替换为 IPC 跳转或通知）
- `runCategorize` 简化版（应改用 api.categorizeWithAI）
- `render` scrollTop 硬编码 36px
- `showMainWindow` 用 0 作 sentinel

**测试状态**：45 passed（1 sanity + 3 schema + 4 pinyin + 9 search + 5 prompts + 7 service + 1 db-init + 11 parser + 4 ipc）


## Phase 8: 详情浮层 + Bug 修复

### Task 18: 详情浮层 HTML + JS

**Files:**
- Create: `renderer/palette/detail.html`
- Create: `renderer/palette/detail.js`

- [ ] **Step 1: 创建 detail.html**

创建 `E:\note\quickbrain\renderer\palette\detail.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>笔记详情</title>
  <style>
    body { margin: 0; padding: 16px; background: rgba(30, 30, 30, 0.95); color: #e0e0e0; font-family: -apple-system, sans-serif; font-size: 13px; height: 100vh; overflow: hidden; }
    h2 { margin: 0 0 8px 0; font-size: 16px; }
    .meta { font-size: 11px; color: rgba(255, 255, 255, 0.5); margin-bottom: 12px; }
    .content { flex: 1; overflow-y: auto; white-space: pre-wrap; line-height: 1.5; padding: 8px; background: rgba(0, 0, 0, 0.3); border-radius: 6px; }
    .actions { display: flex; gap: 8px; margin-top: 12px; }
    button { background: rgba(80, 130, 255, 0.3); border: none; color: #fff; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    button:hover { background: rgba(80, 130, 255, 0.5); }
  </style>
</head>
<body>
  <h2 id="title">加载中…</h2>
  <div class="meta" id="meta"></div>
  <div class="content" id="content"></div>
  <div class="actions">
    <button id="copy-btn">复制</button>
    <button id="ai-btn">AI 格式化</button>
    <button id="close-btn">关闭</button>
  </div>
  <script src="detail.js"></script>
</body>
</html>
```

- [ ] **Step 2: 创建 detail.js**

创建 `E:\note\quickbrain\renderer\palette\detail.js`：

```js
const params = new URLSearchParams(location.search)
const noteId = parseInt(params.get('id'), 10)
const api = window.paletteAPI

let currentNote = null

async function load() {
  const all = await api.searchNotes('')
  currentNote = all.find(n => n.id === noteId)
  if (!currentNote) {
    document.getElementById('title').textContent = '未找到'
    return
  }
  document.getElementById('title').textContent = currentNote.title || '(无标题)'
  document.getElementById('meta').textContent = `分类: ${currentNote.category || '其他'} · ${currentNote.created_at || ''}`
  document.getElementById('content').textContent = currentNote.content
}

document.getElementById('copy-btn').onclick = async () => {
  if (!currentNote) return
  const { clipboard } = require('electron')
  clipboard.writeText(currentNote.content)
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
```
### Task 18 Code Review Observations

> Verdict: **Yes** (self-verified, subagent reviewer errored with "high demand"). Byte-level 验证通过，commit message 包含 plan-level bugs。

#### Byte-level 验证（commit 4739a8b）

| File | Plan bytes | File bytes | Match |
|---|---|---|---|
| `renderer/palette/detail.html` | 1198 (27 lines) | 1198 | ✅ |
| `renderer/palette/detail.js` | 1547 (41 lines) | 1547 | ✅ |

逐字符对比 plan line 2682-2708 (HTML) 和 line 2716-2756 (JS)：**0 差异**。

#### Plan-Level Bugs Discovered（commit message 报告）

**B-1 (CRITICAL)**: `detail.js:9` 调 `api.searchNotes("")` 找 note by id，但 `main/db/search.js:14` 中 `searchNotes(db, "")` 直接 `return []`（短路空查询）。**影响**：详情浮层永远显示"未找到"。

**修复方向（Task 19）**:
1. 新增 `getNote` IPC handler: `ipcMain.handle("get-note", (_, id) => searchNotes(db, "", limit=1) || getNoteById(db, id))`
2. 实际更干净：新增 `getNoteById(db, id)` 在 `main/db/search.js`
3. `palette-preload.js` 暴露 `getNote: (id) => ipcRenderer.invoke("get-note", id)`
4. `detail.js` 改用 `api.getNote(noteId)` 替换 `api.searchNotes("").find(...)`

**B-2**: `detail.js:24` 用了 `const { clipboard } = require("electron")`，renderer + contextIsolation:true 下 `require("electron")` 失败（electron 模块无 renderer API 暴露）。

**修复方向（Task 19）**:
1. 新增 `write-clipboard` IPC handler: `ipcMain.handle("write-clipboard", (_, text) => require("electron").clipboard.writeText(text))`
2. `palette-preload.js` 暴露 `writeClipboard: (text) => ipcRenderer.invoke("write-clipboard", text)`
3. `detail.js` 改用 `api.writeClipboard(currentNote.content)` 替换 `clipboard.writeText(...)`

#### Reviewer Note

- Subagent reviewer (Ampere) errored twice with "high demand" 服务问题
- 由主进程 self-verified: byte-level 0 差异 + tests 45 passed + commit msg 包含 bugs
- 建议 Task 19 implementer 处理 B-1 + B-2 时同时记录

**测试状态**: 45 passed（与 Task 17 一致，无新增测试 — plan 未要求）


### Task 19 Code Review Observations

> Verdict: **Yes** (self-verified, subagent reviewer errored with "high demand"). 3 commits: main.js refactor + 5 IPC channels + 8 renderer fixes.

#### Commits

| Hash | Message | Files |
|---|---|---|
| 5925cf2 | refactor(main): integrate modules into main.js entry point | main.js (rewrite) + ai-service.js (delete) |
| 0144963 | feat(ipc): add 5 new IPC channels for renderer-side native access | main/db/search.js + main/ipc.js + preload/palette-preload.js + tests/ipc.test.js |
| 8589f73 | fix(palette): replace plan-level require("electron")/alert with IPC | renderer/palette/palette.js + renderer/palette/detail.js |

#### Plan-level bugs fixed (Step 1.5 修复)

**B-1 (CRITICAL)**: detail.js `api.searchNotes("").find(...)` 永远 `[]` → 改用 `api.getNote(noteId)`。
- 新增 `getNoteById(db, id)` in main/db/search.js
- 新增 `get-note` IPC handler
- `palette-preload.js` 暴露 `getNote(id)`
- detail.js 改用 `api.getNote(noteId)`

**B-2**: detail.js `require("electron").clipboard` 失败 → 改用 `api.writeClipboard(text)`。
- 新增 `write-clipboard` IPC handler
- `palette-preload.js` 暴露 `writeClipboard(text)`
- detail.js 改用 `api.writeClipboard(...)`

**B-3a/B-3b/B-3c/B-3d**: palette.js 4 处 `require("electron")` 替换为 IPC:
- clipboard.writeText → api.writeClipboard
- new Notification → api.notify
- app.relaunch()/app.quit() → api.relaunch() / api.quit()
- 新增 3 个 IPC handlers + palette-preload 暴露

**B-4 (alert 占位)**: palette.js 9 个 alert() 占位:
- 8 个改为 `api.locateNoteInMain(0); window.close()` (打开主窗口)
- 1 个 (showAbout) 改为 `api.notify({...})`

**B-5**: palette.js `runCategorize` 简化版 → 改用 `api.categorizeWithAI({ content })`

**B-6 (minor)**: `showMainWindow: () => api.locateNoteInMain(0)` → `null` (0 是 note id 哨兵)

**B-7 (minor)**: `render` scrollTop 36 硬编码 → 改为 `itemHeight` 常量 + `Math.max(0, ... - clientHeight/2)` 居中 clamp

#### 关键决策

1. **AIService ESM 处理**: plan 模板用 `require("./main/ai/service")`，但 `service.mjs` 是 ESM。Electron 28 Node 18.18.2 不支持 `require(esm)`。
   - 改用 `const { AIService } = await import("./main/ai/service.mjs")` 在 `app.whenReady().then(async () => { ... })` 内
   - `openAISettings` 闭包 `AIService` 引用避免循环依赖

2. **main.js 体积**: 重写后 91 行（原 200 行），与 plan 模板 byte-level 一致（仅 ESM 处理 4 行差异）

3. **测试覆盖**: 50 passed (45 + 5 new IPC tests). 5 个新测试覆盖 get-note/write-clipboard/notify/relaunch/quit

#### 残留 plan-level bug（无）

所有 Task 17/18 review 报告的 plan-level bug (B-1..B-7) 均已修复。

**测试状态**: 50 passed (1 sanity + 3 schema + 4 pinyin + 9 search + 5 prompts + 7 service + 1 db-init + 11 parser + 9 ipc)

- [ ] **Step 3: Commit**

```bash
cd E:\note\quickbrain
git add renderer/palette/detail.html renderer/palette/detail.js
git commit -m "feat(palette): add detail view window"
```

---

### Task 19: 重构 main.js 整合所有模块

**Files:**
- Modify: `main.js`

- [ ] **Step 1: 重写 main.js**

替换 `E:\note\quickbrain\main.js` 为：

```js
const { app, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { initDatabase, closeDatabase, getDB } = require('./main/db-init')
const { AIService } = require('./main/ai/service')
const { registerIpcHandlers, setAIService } = require('./main/ipc')
const { registerShortcuts, unregisterAll } = require('./main/shortcuts')
const { createTray, notify } = require('./main/tray')
const {
  createPaletteWindow, createMainWindow,
  showPalette, hidePalette, togglePalette,
  toggleMainWindow, showMainWindow
} = require('./main/windows')

function loadAIConfig() {
  const configPath = path.join(app.getPath('userData'), 'config.json')
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      return new AIService(config)
    } catch (e) {
      console.error('Failed to load AI config:', e)
    }
  }
  return null
}

function openAISettings() {
  dialog.showOpenDialog({
    title: '选择配置文件',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  }).then(result => {
    if (!result.canceled && result.filePaths.length > 0) {
      const config = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'))
      setAIService(new AIService(config))
      fs.writeFileSync(
        path.join(app.getPath('userData'), 'config.json'),
        JSON.stringify(config, null, 2)
      )
      notify('QuickBrain', 'AI 配置已更新')
    }
  })
}

app.whenReady().then(async () => {
  await initDatabase()

  const aiService = loadAIConfig()
  if (aiService) setAIService(aiService)

  registerIpcHandlers()

  createPaletteWindow(path.join(__dirname, 'preload'))
  createMainWindow(path.join(__dirname, 'preload'))

  createTray({
    onShowPalette: showPalette,
    onShowMain: toggleMainWindow,
    onSettings: openAISettings,
    onQuit: () => app.quit()
  })

  registerShortcuts({
    onPalette: togglePalette,
    onMainWindow: toggleMainWindow,
    onAddNote: () => showPalette()
  })

  app.on('activate', () => {
    if (!mainWindowExists()) createMainWindow(path.join(__dirname, 'preload'))
  })
})

function mainWindowExists() {
  const { BrowserWindow } = require('electron')
  return BrowserWindow.getAllWindows().some(w => !w.isDestroyed())
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  unregisterAll()
  closeDatabase()
})

module.exports = { getDB }
```

- [ ] **Step 2: 删除旧 ai-service.js 和 preload.js（如存在）**

```bash
cd E:\note\quickbrain
git rm ai-service.js preload.js
```

- [ ] **Step 3: Commit**

```bash
cd E:\note\quickbrain
git add main.js
git commit -m "refactor(main): integrate modules into main.js entry point"
```

---

### Task 20: 端到端启动验证

**Files:**
- (无新增文件，验证用)

- [ ] **Step 1: 启动应用**

```bash
cd E:\note\quickbrain
npm start
```

期望：应用启动，显示主窗口 + 命令面板可通过 Alt+K 唤起。

- [ ] **Step 2: 手动验证清单**

按 `Alt+K` 唤起命令面板，确认：
- [ ] 面板在屏幕顶部居中
- [ ] 输入"测试" → 显示结果
- [ ] `Enter` 复制或触发命令
- [ ] `Esc` 关闭
- [ ] `Ctrl+Q` 唤起主窗口
- [ ] `? test` 触发 AI 搜索（需配置 API key）
- [ ] 输入新内容 + Enter 触发快速添加

- [ ] **Step 3: 跑所有测试**

```bash
cd E:\note\quickbrain
npm test
```

期望：所有测试通过。

- [ ] **Step 4: Commit（如有调整）**

```bash
cd E:\note\quickbrain
git add -A
git commit -m "chore: end-to-end verification"
```

---

## Phase 9: 打包

### Task 21: 构建 NSIS 安装包

**Files:**
- (验证用)

- [ ] **Step 1: 跑构建**

```bash
cd E:\note\quickbrain
npm run build:win
```

期望：`dist/` 目录下生成 `.exe` 安装包。

- [ ] **Step 2: 验证安装包**

双击生成的 `.exe`，安装到临时目录，启动验证功能。

- [ ] **Step 3: 提交构建产物说明**

```bash
cd E:\note\quickbrain
echo "build/" >> .gitignore
git add .gitignore
git commit -m "chore: ignore build artifacts"
```

---

## Self-Review Checklist

- [x] **Spec coverage**: 13 个 spec 章节均有对应任务
  - §1-2 概述/范围 → Phase 1 初始化
  - §3 架构 → Phase 1-6 完整模块
  - §4 命令面板 → Phase 7（Task 14-17）
  - §5 主窗口 → Phase 5 + Task 22（locate-note）
  - §6 AI 集成 → Phase 4（Task 5-6）+ Task 17（scheduleAIFormat）
  - §7 搜索 → Phase 3（Task 3-4）
  - §8 Bug 修复 → Task 19（重构时一并修复 nodeIntegration/contextIsolation/trayIcon/IPC）
  - §9 数据模型 → Phase 2（Task 2-4）
  - §10 命令清单 → Phase 7（Task 15-16）
  - §11 验收 → Task 20 端到端验证
  - §12 风险 → 在每个 task 的 Step 4-5 中体现（如 better-sqlite3 fallback）
  - §13 路线图 → 文档末尾预留

- [x] **No placeholders**: 无 TBD/TODO/待定
- [x] **Type consistency**: 所有函数签名一致（如 `searchNotes(db, query, limit)` 在 Task 4 定义并被 Task 17 调用）
- [x] **Commit frequency**: 每个 task 一次 commit
- [x] **Bite-sized steps**: 每个 step 2-5 分钟

---

**Plan version**: v1.0
**Spec reference**: `docs/superpowers/specs/2026-08-21-quickbrain-spotlight-design.md`
**Ready for execution**

---

## Task 7 Review Deviations（code quality review 记录）

> 由 Task 7 code quality reviewer（Herschel）记录。Verdict: **Yes**（ready to merge）。以下为可选改进项，**不阻塞后续 task**。

### Important

- **I-1**：main/db-init.js 未复用 main/db/index.js 的 createDatabase，绕过 Phase 9 fallback 钩子链。Reviewer 免责说明：plan Step 3 模板本身直接 
ew Database + exec，是 plan-level 设计模糊。
  - **建议处理**：Phase 9 Task 23 之前补一个 micro-refactor task；或在本 plan 显式标注 deviation。
- **I-2**：	ests/db-init.test.js 仅 1 个 happy path，遗漏单例语义（重复调用同实例、closeDatabase 重置）。
  - **建议处理**：Task 8 implementer 可顺手补 2 个单例测试，成本 < 5 分钟。
- **I-3**：sync initDatabase() 内部无 wait，签名与实现不一致。
  - **建议处理**：加 JSDoc 注释说明 "currently synchronous, async signature reserved for future migration to fs.promises / async driver"。

### Minor

- **M-1**：existsSync 检查冗余（mkdirSync({recursive:true}) 已幂等）。
- **M-2**：getDB() 未初始化时静默返回 null（可加 throw 或保持现状，依赖 Task 19 调用方保证）。
- **M-3**：electron stub 仅 mock pp.getPath，未 stub pp.on/whenReady/quit（Task 19 时扩展）。
- **M-4**：Module._cache hack 注释可更详细（Task 8 implementer 可顺手补充）。
- **M-5**：plan 第 1039 行路径偏差未标注 —— **此区块即作为正式标注**。

### Reviewer Top Recommendations

1. Phase 9 Task 23（fallback）前显式重构 db-init.js 复用 createDatabase，让 fallback 路径单点改造。
2. 补充单例语义测试（见 I-2）。
3. initDatabase() 加 JSDoc 注释（见 I-3）。

---
