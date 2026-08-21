const OpenAI = require('openai');

class AIService {
  constructor(config) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || 'https://api.deepseek.com'
    });
    this.model = config.model || 'deepseek-chat';
    this.defaultStyle = config.defaultStyle || 'summary';
  }

  async formatContent(content, style = null) {
    const selectedStyle = style || this.defaultStyle;
    const prompt = this.buildPrompt(content, selectedStyle);
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: '你是一个专业的信息整理助手。请将用户输入的内容按照要求格式进行整理。输出应该清晰、结构化，便于阅读和检索。只输出整理后的内容，不要添加额外的解释。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      });
      return { success: true, formattedContent: response.choices[0].message.content.trim() };
    } catch (error) {
      return { success: false, error: error.message || '格式化失败' };
    }
  }

  async categorizeContent(content) {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: '分析这段内容的主题，返回JSON：{"category":"类别","tags":["标签"]}"。类别只能是：工作、学习、生活、灵感、其他。标签最多5个，用逗号分隔。' },
          { role: 'user', content: content.substring(0, 1000) }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3
      });
      const result = JSON.parse(response.choices[0].message.content);
      return {
        category: result.category || '其他',
        tags: (result.tags || '').split(',').map(t => t.trim()).filter(t => t)
      };
    } catch (error) {
      return { category: '其他', tags: [] };
    }
  }

  buildPrompt(content, style) {
    const prompts = {
      summary: `请将以下内容整理成简洁的摘要，保留关键信息：\n\n${content}`,
      structured: `请将以下内容整理成结构化格式，包括：标题、要点、详细说明：\n\n${content}`,
      tags: `请分析以下内容，提取关键标签并重新组织成带标签的结构化笔记：\n\n${content}`,
      mindmap: `请将以下内容整理成思维导图形式，使用层级结构展示：\n\n${content}`
    };
    return prompts[style] || prompts.summary;
  }
}

module.exports = AIService;
