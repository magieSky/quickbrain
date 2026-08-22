// AI Provider 元数据 - 全部使用 OpenAI 兼容协议
// 配置格式: { provider: 'deepseek', apiKey: 'sk-xxx' }
// Ollama 额外需要: baseURL, model

export const PROVIDERS = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: '\u{1F30A}',
    description: '\u6DF1\u5EA6\u6C42\u7D22 - \u4E2D\u6587\u80FD\u529B\u5F3A\uFF0C\u4EF7\u683C\u4FBF\u5B9C',
    baseURL: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    requiresApiKey: true,
    keyHint: '\u4ECE platform.deepseek.com \u83B7\u53D6 API Key',
    keyUrl: 'https://platform.deepseek.com/api_keys'
  },
  {
    id: 'moonshot',
    name: '\u6708\u4E4B\u6697\u9762 Kimi',
    icon: '\u{1F319}',
    description: 'Moonshot AI - \u957F\u4E0A\u4E0B\u6587\u652F\u6301',
    baseURL: 'https://api.moonshot.cn',
    defaultModel: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    requiresApiKey: true,
    keyHint: '\u4ECE platform.moonshot.cn \u83B7\u53D6 API Key',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys'
  },
  {
    id: 'zhipu',
    name: '\u667A\u8C31 GLM',
    icon: '\u{1F9E0}',
    description: '\u667A\u8C31 AI - \u6E05\u534E\u7CFB\u5927\u6A21\u578B',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    models: ['glm-4-flash', 'glm-4', 'glm-4-plus'],
    requiresApiKey: true,
    keyHint: '\u4ECE bigmodel.cn \u83B7\u53D6 API Key',
    keyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys'
  },
  {
    id: 'qwen',
    name: '\u901A\u4E49\u5343\u95EE Qwen',
    icon: '\u2601\uFE0F',
    description: '\u963F\u91CC\u4E91 - \u901A\u4E49\u5927\u6A21\u578B',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-turbo',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long'],
    requiresApiKey: true,
    keyHint: '\u4ECE\u963F\u91CC\u4E91\u767E\u70BC\u83B7\u53D6 API Key',
    keyUrl: 'https://dashscope.console.aliyun.com/apiKey'
  },
  {
    id: 'ollama',
    name: 'Ollama (\u672C\u5730)',
    icon: '\u{1F999}',
    description: '\u672C\u5730\u8FD0\u884C\u7684\u5F00\u6E90\u6A21\u578B\uFF0C\u65E0\u9700\u8054\u7F51',
    baseURL: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5:7b',
    models: [],
    requiresApiKey: false,
    customBaseURL: true,
    customModel: true,
    keyHint: 'Ollama \u9ED8\u8BA4\u4E0D\u9700\u8981 key\uFF0C\u4EFB\u610F\u5B57\u7B26\u4E32\u5373\u53EF',
    keyUrl: 'https://ollama.com'
  }
]

export function getProvider(id) {
  return PROVIDERS.find(p => p.id === id)
}