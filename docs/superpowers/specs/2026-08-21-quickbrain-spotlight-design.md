# QuickBrain Spotlight 化 v1.0 — 设计文档

**日期**：2026-08-21
**作者**：与用户共同头脑风暴产出
**状态**：草案，待用户审阅

---

## 1. 概述

QuickBrain 当前是一个基于 Electron 的个人知识管理工具雏形（已实现托盘常驻、全局快捷键、SQLite 存储、OpenAI 兼容 AI 格式化）。但现有形态是 600×700 的"主窗口"，搜索能力薄弱（仅 `LIKE '%x%'`），无法提供"输入即所得"的快速检索体验。

本次 v1.0 将 QuickBrain 改造为"命令面板（Spotlight 风格）+ 主窗口并存"的个人知识管理工具：命令面板承担快速检索和操作、主窗口承担浏览管理，搜索子系统升级为 SQLite FTS5 + 中文分词 + 拼音首字母，AI 集成从"格式化按钮"升级为"快速添加自动 AI + 显式 AI + 语义搜索兜底"。

## 2. 目标 / 范围 / 非目标

### 2.1 目标

- 在一次 v1.0 发布中交付完整的命令面板 + 搜索升级 + AI 集成 + bug 修复
- 用户能通过 `Alt+K` 在 1 秒内找到任意笔记并复制到剪贴板
- 用户输入 `?` 前缀触发 AI 语义搜索兜底
- 快速添加时自动 AI 摘要/分类，已有笔记显式触发格式化

### 2.2 范围内

1. 命令面板（`Alt+K` 唤起）：搜索、快速添加、复制、AI 格式化、详情浮层、21 条内置命令
2. 主窗口（`Ctrl+Q` 唤起）：保留浏览管理能力
3. 搜索子系统升级：SQLite FTS5 + 中文分词 + 拼音首字母
4. AI 集成：自动格式化入库、显式格式化菜单、AI 语义搜索兜底
5. 现有 bug 修复：`trayIcon` 声明、IPC 监听、快捷键注册、`nodeIntegration` 安全加固
6. 数据持久化与备份导出

### 2.3 非目标（v1.0 不做）

- 外部数据源 connector（Notion / 微信 / 文件系统扫描）
- 多设备同步
- 可扩展命令系统（用户自注册命令、绑定快捷键）
- 系统级命令（打开应用、计算器等 Alfred 风格）
- AI-first 模式（所有输入先过 AI 解析）
- 数据迁移（DB 未生成过，无需迁移）

## 3. 架构总览

```
quickbrain/
├── main/
│   ├── windows.js          # 主窗口 + 命令面板窗口管理
│   ├── shortcuts.js        # 全局快捷键注册
│   ├── ipc.js              # IPC 处理器
│   ├── tray.js             # 系统托盘
│   ├── db/
│   │   ├── index.js        # better-sqlite3 连接
│   │   ├── schema.sql      # 表结构 + FTS5 + 触发器
│   │   ├── search.js       # 搜索 API（本地 + 拼音兜底）
│   │   └── pinyin.js       # 拼音首字母生成
│   └── ai/
│       ├── service.js      # OpenAI 兼容客户端
│       └── prompts.js      # prompt 模板
├── preload/
│   ├── main-preload.js     # 主窗口桥
│   └── palette-preload.js  # 命令面板桥
├── renderer/
│   ├── main/               # 主窗口 UI（保留）
│   └── palette/            # 命令面板 UI（新增）
├── config.json
├── config.example.json
├── package.json
└── README.md
```

**关键数据流**：

- **命令面板搜索**：用户输入 → IPC → 搜索 API（FTS5 + 拼音兜底）→ 返回结果 → 渲染面板
- **AI 兜底语义搜索**：用户输入 `? ...` → IPC → AI 服务 → 解析为笔记 ID 列表 → 渲染
- **快速添加**：用户输入新内容 + Enter → IPC → 入库 → 后台异步 AI → 回填
- **Enter 复制**：选中笔记 → IPC → 复制到剪贴板 → 关闭面板
- **Shift+Enter 详情**：选中笔记 → 弹独立详情窗口

## 4. 命令面板

### 4.1 形态规格

| 属性 | 值 |
|---|---|
| 位置 | 屏幕顶部居中，距顶 1/6 屏高 |
| 大小 | 400 × 500 px |
| 外观 | 半透明背景（毛玻璃）+ 圆角 12px + 阴影 |
| 边框 | 无边框窗口（`frame: false`） |
| 透明度 | 默认 0.92，可在设置里调整 |
| 阴影 | 系统默认 + 增强阴影 |

### 4.2 生命周期

- **启动**：应用就绪后预创建命令面板 BrowserWindow，但 `hide()`
- **`Alt+K` 唤起**：若可见则聚焦；若隐藏则 `show() + focus() + 清空输入 + 重置结果`
- **失焦**：默认自动隐藏；设置里可改为"保留焦点"
- **`Esc`**：输入框非空 → 清空输入；输入框空 → 隐藏面板
- **销毁**：随应用退出销毁，不单独管理

### 4.3 UI 结构

```
┌─────────────────────────────────┐
│ [输入框：搜索或输入命令]            │  ← 顶部，约 56px 高
├─────────────────────────────────┤
│ ┌─命令───────────────────────┐ │  ← 分组标题（小、灰）
│ │ 添加新笔记                   │ │
│ │ 打开主窗口                   │ │
│ │ 打开设置                     │ │
│ └─────────────────────────────┘ │
│ ┌─笔记 (3)───────────────────┐ │  ← 命中数显示
│ │ 📝 关于 X 的资料              │ │  ← 选中态高亮
│ │ 📝 Y 项目笔记                │ │
│ │ 📝 Z 学习记录                │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ ↑↓ 选择 · Enter 复制 · Shift+Enter 详情  │  ← 底部状态栏
└─────────────────────────────────┘
```

**渲染层技术栈**：原生 HTML + CSS + JS（保持 QuickBrain 一致性，不引入 React/Vue）。

### 4.4 核心交互表

| 操作 | 行为 |
|---|---|
| 输入字符 | 防抖 100ms 后触发搜索；分组显示（命令 / 笔记 / AI 结果） |
| `↑` / `↓` | 在结果列表中上下移动选中项（跨分组循环） |
| `Enter` | 默认动作：复制选中项内容到剪贴板 + 关闭面板 |
| `Shift+Enter` | 弹详情浮层（独立 400×500 BrowserWindow，复用主窗口详情组件） |
| `Ctrl+Enter` | 主窗口显示并定位到该笔记（高亮 + 滚动） |
| `Esc` | 清空输入（非空时）；隐藏面板（空时） |
| `Tab` | 在命令分组 / 笔记分组 / AI 分组之间循环切换 |
| `Shift+Tab` | 反向切换分组 |
| 输入 `? ...` | 走 AI 语义搜索兜底（参见第 6.3 节） |
| 输入纯新内容 + `Enter` | 快速添加：自动 AI 格式化入库（参见第 6.1 节） |
| 输入 `ai [风格] [笔记]` | 对指定笔记显式 AI 格式化（参见第 6.2 节） |
| `Shift+F`（选中笔记时） | 弹风格菜单（摘要 / 结构化 / 标签 / 思维导图） |

### 4.5 分组规则

- **命令分组**：匹配内置命令名（如 `添加笔记`、`打开设置`、`导出`）
- **笔记分组**：FTS5 + 拼音兜底命中
- **AI 分组**：仅当 `?` 前缀触发时显示

分组顺序：命令 → 笔记 → AI。同一分组内按评分排序。

## 5. 主窗口（保留）

- **触发**：`Ctrl+Q`（显示/隐藏）或托盘菜单
- **职责**：浏览管理（全部笔记、按分类筛选、按时间排序）、选中笔记后查看/编辑/AI 格式化、设置入口
- **形态**：保持现有 600×700 设计
- **与命令面板的联动**：命令面板 `Ctrl+Enter` 触发主窗口定位；主窗口内仍可执行所有现有操作

## 6. AI 集成

### 6.1 快速添加自动 AI

**触发**：命令面板输入纯新内容 + `Enter`（非 `?` 前缀、非 `ai` 前缀、非命令名）

**输入解析优先级**（命令面板渲染层判断，主进程不感知）：
1. 以 `? ` 开头 → AI 语义搜索（参见 6.3）
2. 以 `ai ` 开头（且 `? ` 不匹配）→ 显式 AI 格式化命令（参见 6.2）
3. 完全匹配某条内置命令名 → 触发该命令（参见第 10 章）
4. 其余输入 → 视为"新内容"，触发快速添加（参见下方流程）

**流程**：
1. 立即入库：`is_formatted=0`、`original_content=输入内容`、`title=''`、`content=输入内容`、`category='uncategorized'`、`tags='[]'`
2. 返回成功给用户（"已添加，AI 格式化中…"）
3. 后台异步调用 AI 服务（不阻塞 UI）：
   - 输入：原文（截断到 2000 字符）
   - 输出：JSON `{title, summary, category, tags}`
4. AI 返回后：更新对应笔记字段，`is_formatted=1`，`content=summary`，`title=title`，`category=category`，`tags=JSON.stringify(tags)`
5. 通知用户（系统通知 + 面板可显示"已格式化"）

**降级**：AI 失败 → 保留原文，通知"AI 格式化失败，已保留原文"

### 6.2 显式格式化（选中已有笔记）

**触发方式 A**：`Shift+F`（选中笔记时）弹风格菜单
**触发方式 B**：输入框输入 `ai 风格 笔记关键词`（如 `ai 摘要 X 项目`）

**风格**：摘要 / 结构化 / 标签 / 思维导图

**流程**：
1. 解析风格 + 目标笔记（通过关键词匹配）
2. AI 服务调用对应 prompt
3. 返回内容 → 回填到笔记的 `content` 字段，保留原文到 `original_content`，设置 `is_formatted=1`
4. 通知结果

### 6.3 AI 语义搜索兜底

**触发**：输入以 `? ` 开头

**流程**：
1. 去掉 `? ` 前缀，得到用户查询
2. 面板顶部显示"AI 召回中…"
3. AI 服务调用语义搜索 prompt：
   - 输入：用户查询 + 本地 top 20 笔记摘要列表
   - 输出：JSON `{matchedIds: [1, 5, 12], reasoning: "..."}`
4. 解析返回的笔记 ID → 从 DB 查询完整记录 → 渲染到 AI 分组
5. 失败 → 显示"AI 召回失败，请检查 API 配置或重试"

**性能预期**：本地搜索 < 50ms；AI 召回 1~3s

### 6.4 错误处理

| 错误 | 处理 |
|---|---|
| API key 未配置 | 弹窗引导去设置页面 |
| 网络错误 | 保留原文 + 通知"网络错误，已保留原文" |
| API 限流（429） | 保留原文 + 通知"限流中，请稍后重试" |
| 超时（> 10s） | 取消请求 + 通知"AI 响应超时" |
| AI 返回格式错误 | 保留原文 + 通知"AI 返回异常" |

## 7. 搜索子系统

### 7.1 技术栈

- **better-sqlite3**（替换 sql.js）：同步 API、原生绑定、性能 5~10x 提升
- **FTS5**：SQLite 内置全文检索虚拟表
- **@node-rs/jieba**：Rust 实现中文分词（性能好、零运行时依赖）
- **pinyin-pro**：拼音首字母生成

### 7.2 表结构

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

-- FTS5 虚拟表（同步触发器维护）
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

### 7.2.1 分词策略

FTS5 内置 `unicode61` 分词器为字符级切分，对中文支持有限。采用 **"应用层预分词 + FTS5 字符匹配"** 双层策略：

- **写入侧**：用 `@node-rs/jieba` 对 `title` / `content` / `tags` 做中文分词（"分布式锁" → "分布式 锁"），分词后用空格连接存入 `notes_fts`
- **查询侧**：FTS5 用 `unicode61` 在已分词文本上做字符级匹配，无需运行时再分词
- **原始文本**：完整原文保留在 `notes.content` / `notes.title`，不丢失
- **拼音兜底**：见 7.3，应用层用 `pinyin-pro` 生成拼音首字母存 `notes_pinyin` 表

### 7.3 搜索 API

```js
// 伪代码
function searchNotes(query) {
  // 1. FTS5 精确匹配
  let results = fts5Query(query)

  // 2. FTS5 无结果或弱结果（< 3 条）→ 拼音兜底
  if (results.length < 3) {
    const pinyinResults = pinyinQuery(query)
    results = mergeAndRank(results, pinyinResults)
  }

  // 3. 评分排序
  return rankByScore(results)
}
```

### 7.4 评分规则

| 命中位置 | 权重 |
|---|---|
| 标题前缀 | 5 |
| 标题中部 | 3 |
| 标签前缀 | 4 |
| 标签中部 | 2 |
| 内容前缀 | 2 |
| 内容中部 | 1 |

拼音命中按对应位置权重 × 0.7 计算。

### 7.5 性能预期

- **本地搜索**：< 50ms（5000 条数据规模）
- **拼音兜底**：< 100ms
- **AI 召回**：1~3s（网络 + API 响应）

## 8. Bug 修复与安全加固

### 8.1 必修 Bug 清单

| # | Bug | 文件 | 修复 |
|---|---|---|---|
| 1 | `trayIcon` 未在模块顶部声明 | `main.js` | 顶部加 `let trayIcon;` |
| 2 | `hide-window` IPC 未注册监听 | `main.js` | 添加 `ipcMain.on('hide-window', ...)` 和 `show-window` |
| 3 | `Ctrl+F`（AI 格式化）全局快捷键未注册 | `main.js` | 添加到 `registerShortcut()` |
| 4 | `Ctrl+K` / `/` 全局快捷键未注册 | `main.js` | 改为 `Alt+K`（避免冲突），同时支持 `/` |
| 5 | `Esc` 关闭面板未注册 | `main.js` | 添加全局 `Esc` 处理（命令面板聚焦时） |
| 6 | `nodeIntegration: true` 安全风险 | `main.js` | 改为 `false` |
| 7 | `contextIsolation: false` 安全风险 | `main.js` | 改为 `true`，preload 用 `contextBridge` 暴露白名单 API |
| 8 | `preload.js` 中 `open-settings` 监听器无对应 sender | `preload.js` | 与主进程 IPC 对齐，移除未使用入口 |

### 8.2 性能优化

| # | 优化 | 说明 |
|---|---|---|
| 1 | sql.js → better-sqlite3 | 同步 API、原生绑定、内存常驻、性能 5~10x |
| 2 | DB 连接复用 | 应用启动时单例连接 |
| 3 | FTS5 索引预热 | 应用启动时 `INSERT INTO notes_fts(notes_fts) VALUES('rebuild')` |

### 8.3 安全检查清单

- `nodeIntegration: false`
- `contextIsolation: true`
- `webSecurity: true`（默认）
- preload 只暴露白名单 API
- 渲染层禁止直接访问 `require`
- IPC 处理器校验参数类型

## 9. 数据模型与持久化

### 9.1 持久化位置

- **数据库**：`%APPDATA%\quickbrain\quickbrain.db`
- **配置**：`%APPDATA%\quickbrain\config.json`
- **导出**：`%USERPROFILE%\Documents\quickbrain-exports\` 或用户指定位置

### 9.2 配置结构

```json
{
  "apiKey": "sk-xxx",
  "baseURL": "https://api.deepseek.com",
  "model": "deepseek-chat",
  "defaultStyle": "summary",
  "palette": {
    "opacity": 0.92,
    "hideOnBlur": true,
    "width": 400,
    "height": 500
  },
  "shortcuts": {
    "palette": "Alt+K",
    "mainWindow": "Ctrl+Q",
    "addNote": "Ctrl+A",
    "formatNote": "Shift+F"
  }
}
```

### 9.3 备份与导出

**命令 `导出所有笔记`**：
- 输出：`quickbrain-export-YYYYMMDD-HHmmss.json`（完整数据）
- 输出：`quickbrain-export-YYYYMMDD-HHmmss/`（每条笔记一个 `.md` 文件，文件名用 title 或 id）

**命令 `备份数据库`**：
- 复制当前 `quickbrain.db` 到指定位置（默认 `Documents\quickbrain-backups\`）

**命令 `导入笔记`**：
- 从 JSON 导入
- 选项：`merge`（按 id 跳过已存在）/ `replace`（清空后导入）

### 9.4 数据迁移

v1.0 无迁移需求（DB 未生成过）。

未来版本如需迁移，提供 `db/migrate.js` 脚本按版本号顺序执行迁移 SQL。

## 10. 内置命令清单（21 条）

| 类别 | 命令 | 触发方式 | 行为 |
|---|---|---|---|
| 操作 | 添加笔记 | 输入 `添加笔记 [内容]` | 快速添加（自动 AI） |
| 操作 | 格式化 [标题] | 输入 `格式化 [关键词]` | 对匹配笔记 AI 格式化 |
| 操作 | 复制 [标题] | 输入 `复制 [关键词]` | 复制到剪贴板 |
| 操作 | 删除 [标题] | 输入 `删除 [关键词]` | 删除笔记（需确认） |
| 操作 | 编辑 [标题] | 输入 `编辑 [关键词]` | 在主窗口打开编辑器 |
| 操作 | 分类 [标题] [类] | 输入 `分类 [关键词] [分类]` | 设置分类 |
| 操作 | 重新分类 [标题] | 输入 `重新分类 [关键词]` | AI 重新分类 |
| 导航 | 打开主窗口 | 输入 `打开主窗口` 或选中该项 | 显示主窗口 |
| 导航 | 打开设置 | 输入 `打开设置` | 打开设置面板 |
| 导航 | 打开数据目录 | 输入 `打开数据目录` | 资源管理器打开 |
| 数据 | 导出所有笔记 | 输入 `导出所有笔记` | 导出为 JSON + Markdown |
| 数据 | 导入笔记 | 输入 `导入笔记` | 从 JSON 导入 |
| 数据 | 备份数据库 | 输入 `备份数据库` | 复制 DB 到指定位置 |
| 数据 | 清空所有笔记 | 输入 `清空所有笔记` | 危险操作，需二次确认 |
| 数据 | 显示统计 | 输入 `显示统计` | 显示总数 / 各分类数 |
| AI | AI 设置 | 输入 `AI 设置` | 配置 API key / baseURL / model |
| AI | ? [查询] | 输入 `? [自然语言]` | AI 语义搜索 |
| 系统 | 重启应用 | 输入 `重启应用` | 退出并重启 |
| 系统 | 退出 QuickBrain | 输入 `退出` | 退出应用 |
| 系统 | 关于 | 输入 `关于` | 显示版本信息 |
| 风格 | ai 摘要 / 结构化 / 标签 / 思维导图 | 选中笔记 + 输入 `ai [风格]` | 对选中笔记 AI 格式化 |

## 11. 验收标准

### 11.1 功能验收

- `Alt+K` 唤起命令面板，出现在屏幕顶部居中
- 输入关键词 100ms 内显示搜索结果
- `Enter` 复制选中项到剪贴板，面板关闭
- `Shift+Enter` 弹出详情浮层
- `Ctrl+Enter` 主窗口显示并定位笔记
- `Esc` 清空输入或关闭面板
- `?` 前缀触发 AI 语义搜索，面板显示"AI 召回中…"
- 纯新内容 + Enter 触发快速添加，后台 AI 自动格式化
- 选中笔记 + `Shift+F` 弹风格菜单
- 21 条内置命令全部可触发
- 拼音首字母兜底搜索生效（如输入 `bj` 命中"北京"）
- 中文分词生效（如输入"分布式锁"命中"分布式锁的实现"）

### 11.2 安全验收

- `nodeIntegration: false`、`contextIsolation: true`
- 渲染层无法访问 `require`
- IPC handler 校验参数类型
- preload 只暴露白名单 API

### 11.3 性能验收

- 本地搜索 < 50ms（5000 条数据）
- 拼音兜底搜索 < 100ms
- AI 召回 1~3s
- 命令面板唤起 < 100ms
- 应用启动 < 2s

### 11.4 兼容性验收

- Windows 10/11 正常运行
- electron-builder 打包 NSIS 安装包成功
- 现有 config.json 兼容读取

## 12. 风险与权衡

### 12.1 技术风险

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| better-sqlite3 原生编译失败 | 中 | 高 | 优先使用 prebuilt；若失败自动 fallback 到 sql.js，启动日志告警 |
| @node-rs/jieba 安装失败 | 低 | 中 | Fallback 到纯 JS 实现 `nodejieba`；再失败则退化为单字匹配（unicode61 only） |
| FTS5 中文分词不理想 | 中 | 中 | 拼音兜底 + AI 兜底双保险 |
| AI 召回延迟影响 UX | 中 | 中 | 面板显示加载状态；本地结果优先 |
| 全局快捷键与系统冲突 | 低 | 低 | 设置里允许自定义 |

### 12.2 设计权衡

- **命令面板 vs 主窗口并存**：增加 UI 复杂度，但保留浏览管理能力，决策合理
- **Enter 默认复制 vs 默认详情**：选择更轻的动作（复制）符合 Spotlight 哲学；Shift+Enter 提供深度操作
- **AI 显式触发（`?` 前缀）vs 自动触发**：选择显式控制，避免意外 token 消耗
- **快速添加自动 AI vs 手动触发**：选择自动，节省用户操作；后台异步不影响 UI
- **sql.js → better-sqlite3**：性能提升显著，但增加原生依赖编译复杂度

### 12.3 范围控制

v1.0 明确排除外部数据源、多设备同步、可扩展命令系统等高级特性。这些留待后续版本。

## 13. 后续路线图（v1.1+ 预告，不在 v1.0 范围）

- **v1.1**：外部数据源 connector（本地文件扫描、浏览器书签导入）
- **v1.2**：可扩展命令系统（用户自注册命令、绑定快捷键）
- **v1.3**：多设备同步（自托管 / 云端）
- **v2.0**：AI-first 模式（所有输入都先过 AI 解析）

---

**文档版本**：v1.0 草案
**等待用户审阅**
