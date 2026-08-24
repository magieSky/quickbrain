# 主面板 UI 重设计 (2026-08-24)

## 目标
把主面板从"13 个 chip + 跳动的 batch-bar + 4 按钮挤一排"重做成"工具栏 / 浮动底栏 / hover 卡片"三段式，视觉更聚焦、布局更稳。

## 范围
仅 `client/src/renderer/main/index.html` + `client/src/renderer/main/main.js` + 同目录的 CSS。
**不在范围**：add modal、AI modal、settings 弹框、palette (命令面板)、extension。这些保持不动。

## 设计

### 1. 工具栏重排（顶部固定）
新结构：
```
[+ 添加笔记]  [🔍 搜索....................]                [筛选 ▾ N]  [☐ 多选]  [✨ AI]  [📥 导入]  [⚙]
```
- 搜索框搬进工具栏，宽度自适应中间剩余空间
- "筛选 N" 按钮：N = 当前激活的过滤条件数（0 不显示 N）；点击弹 popover
- "多选" 是独立 toggle 按钮，激活时高亮
- 工具栏加 1px 底部分隔线，跟下方内容区视觉断开

### 2. 筛选 popover
点击"筛选"按钮，浮出 popover（不是新页面，不是 modal）：
- 三个分区：**分类** / **类型** / **隐私**
- 分类：单选 chip（全部 / 工作 / 学习 / 生活 / 灵感 / 其他）
- 类型：单选 chip（全部 / 源笔记 / 原子笔记）
- 隐私：单选 chip（全部 / 仅本机 / 已同步）
- 底部一个 "清空筛选" 按钮
- 点击 popover 外或工具栏"筛选"按钮再次 → 关闭
- 现有 `currentCategory / currentType / currentPrivacy` 状态保留，popover 操作的是同一个 state

### 3. 多选模式
- 点"多选"按钮切换 `selectionMode`
- 进入多选时：
  - note 卡片左边出现 checkbox
  - 顶部统计区变成"已选 N 条"
  - "添加笔记 / AI / 导入 / 设置" 按钮变灰禁用（防止多选时误操作）
  - 浮动底栏出现（见 4）
- 退出多选：
  - 再次点"多选"按钮
  - 选中 0 条自动不退出（保持模式，方便再勾）
  - 浮动底栏的"取消"按钮
- 快捷键：`Ctrl/⌘+M` 进入/退出多选（沿用现有快捷键体系，不另起）

### 4. 浮动底栏（替换原 batch-bar）
固定贴底（`position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%)`）：
- 圆角卡片样式，半透明背景 + 阴影
- 内容：`[已选 N 条]  [全选可见 / 取消全选]  [☁︎ 公开同步]  [🔒 设为仅本机]  [× 取消多选]`
- 不挤占列表高度，列表滚动区不因此跳动
- 没有选中时整个浮动条隐藏

### 5. Note 卡片重做
- 默认渲染（无 hover）：
  - 左侧：私密状态指示（私密 = 4px 橙色左边条 + 角标 "🔒"；公开 = 无）
  - 中间：title / 摘要（最多 2 行）
  - 底部 meta：分类 badge + tags + 日期
  - 右侧：3 个小图标按钮（编辑 / AI / 删除），半透明
- Hover 时：右侧按钮变不透明；同时左上角浮出 `🔒 / ☁︎` 私密切换按钮
- 私密切换点击 = 直接 toggle 该 note 的 `is_private`，无需进入多选
- 多选模式下：卡片左边变 checkbox，hover 时的私密按钮隐藏（避免两套入口混淆）
- 删除按钮 hover 变红，2 次确认：第 1 次点击按钮变色 "确认删除？"，3 秒后还原

### 6. 视觉
- chips 行整段删掉
- batch-bar DOM 删掉（功能移到浮动底栏）
- 工具栏底部分隔线：`border-bottom: 1px solid rgba(255,255,255,0.08)`
- 浮动底栏：`background: rgba(30,30,32,0.92); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 20px rgba(0,0,0,0.4)`
- 筛选 popover：同上风格的浮层，宽度 280px，三个分区用细线分隔
- 工具栏按钮统一为 icon + 小字（icon 14px，字 12px），跟原来大按钮观感拉开

## 保留的 IPC 行为
- `add-note` / `set-note-private` / `set-notes-private-bulk` 不变
- `notes-updated` broadcast 不变
- `applyServerRowToDb` 的 is_private 保护不变
- preload 暴露不变
- 所有 selection 状态在 renderer 内部管理（`selectionMode` / `selectedIds`）

## 数据流
跟现在一致。改动只在 `client/src/renderer/main/`：
- `index.html`：删 #filters、#batch-bar；改写工具栏 DOM；加 #filter-popover
- `main.js`：删 chip click handlers（移到 popover）；新增 popover 开关逻辑；新增 hover 行为；新增浮动底栏

## 不做
- 不重写 settings 弹框
- 不动 AI modal
- 不动 add modal（保留 per-note 私密的 checkbox）
- 不动命令面板 (palette)
- 不动 browser extension
- 不动 server 端

## 验证
- `cdp-verify-batch.js` 仍通过（多选 + 批量 + per-note toggle 端到端）
- `cdp-verify-privacy.js` 仍通过
- `npm test` 251 个仍全过
- 手动跑：每个视觉点都看一遍（hover / 多选 / 筛选 / 浮动底栏 / 搜索 / 私密切换）

## 风险
- popover 的 click-outside 关闭逻辑容易写漏（event listener 顺序问题）→ 沿用 mousedown 监听 + check 容器
- hover 按钮的 mouseenter/mouseleave 频繁触发 render 会有性能问题 → 不用 render，单独 toggle class
- 浮动底栏 z-index 要比 note-list 高，否则会被遮
- 旧的 `#filters .filter-chip` 委托 handler 之前有 bug 修过（`if (!chip.dataset.cat) return`），重做后这段代码整体删掉即可

## 验收
- 用户打开主面板，看到的工具栏、note 卡片、浮动底栏、筛选 popover 都跟设计一致
- 多选 / 私密切换 / 筛选 / 搜索 / 删除 所有路径都跟之前 E2E 测试一致
- 视觉上：13 chip 没了，batch-bar 跳的 bug 没了
