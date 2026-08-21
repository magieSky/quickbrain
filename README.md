# QuickBrain - 个人知识管理助手

一个基于 Electron 的桌面应用，帮助你快速检索和管理散落的信息。

## 功能特性

- **快捷键唤起**：`Ctrl+Q` 快速显示/隐藏窗口
- **快速添加**：`Ctrl+A` 一键打开添加对话框
- **即时搜索**：支持内容、标题、标签的多维度搜索
- **AI格式化**：接入大模型，自动整理你的信息
- **分类管理**：工作、学习、生活、灵感等分类
- **标签系统**：自定义标签，方便筛选

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Q` | 显示/隐藏窗口 |
| `Ctrl+A` | 快速添加笔记 |
| `Ctrl+F` | AI格式化 |
| `Ctrl+K` 或 `/` | 聚焦搜索框 |
| `Esc` | 关闭对话框 |

## 安装运行

```bash
cd E:\note\quickbrain
npm install
npm start
```

或直接双击 `run.bat`

## 配置 AI 服务

1. 编辑 `config.json`，填入你的 API 信息：
```json
{
  "apiKey": "sk-xxx",
  "baseURL": "https://api.deepseek.com",
  "model": "deepseek-chat",
  "defaultStyle": "summary"
}
```

## 支持的模型

- DeepSeek Chat (推荐)
- GPT-3.5 / GPT-4
- Claude (通过兼容接口)
- 任何 OpenAI 兼容接口

## 构建发布

```bash
npm run build:win
```

生成的安装包在 `dist/` 目录。

## 技术栈

- Electron 28
- SQL.js (纯JS SQLite)
- OpenAI SDK
- CSS3 + 原生 JavaScript

## 数据存储位置

Windows: `%APPDATA%\quickbrain\quickbrain.db`
