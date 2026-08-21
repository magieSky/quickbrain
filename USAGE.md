# QuickBrain 使用指南

## 快速开始

### 1. 首次运行

双击 `run.bat` 启动应用（会自动安装依赖）

### 2. 配置 AI 服务

1. 复制配置文件：
   ```
   copy config.example.json config.json
   ```

2. 编辑 `config.json`，填入你的 API 信息：
   ```json
   {
     "apiKey": "sk-你的API密钥",
     "baseURL": "https://api.deepseek.com",
     "model": "deepseek-chat",
     "defaultStyle": "summary"
   }
   ```

3. 或者运行时右键托盘图标选择"设置"加载配置文件

### 3. 开始使用

- **Ctrl+Q**: 显示/隐藏窗口（随时唤起）
- **Ctrl+A**: 快速添加笔记
- **Ctrl+F**: AI格式化当前选中的笔记
- **Ctrl+K** 或 `/`: 聚焦搜索框

## 功能说明

### 搜索
在顶部搜索框输入关键字，实时检索内容、标题和标签。

### 分类
点击分类标签快速筛选：工作、学习、生活、灵感。

### 快速添加
按 Ctrl+A 打开添加对话框，粘贴或输入信息即可保存。

### AI格式化
选中笔记点击 ✨ 按钮，可选择格式化方式：
- **摘要整理**: 提取关键信息，精简内容
- **结构化输出**: 整理成清晰的层次结构
- **标签分类**: 自动提取标签
- **思维导图**: 整理成层级关系

## 支持的 API

| 服务商 | baseURL | 推荐模型 |
|--------|---------|----------|
| DeepSeek | https://api.deepseek.com | deepseek-chat |
| OpenAI | https://api.openai.com | gpt-3.5-turbo |
| Azure OpenAI | 你的endpoint | gpt-35-turbo |
| 其他兼容接口 | 自定义 | 兼容OpenAI协议的模型 |

## 数据存储

所有数据存储在：
```
C:\Users\你的用户名\AppData\Roaming\quickbrain\quickbrain.db
```

这是 SQLite 数据库，可以用 DB Browser 等工具查看。

## 构建发布

```bash
npm run build:win
```

生成的安装包在 `dist/` 目录，可以分享给其他人使用。
