import OpenAI from 'openai'
import { SYSTEM_PROMPT, CATEGORIZE_PROMPT, buildFormatPrompt, buildSemanticSearchPrompt } from './prompts.js'

export class AIService {
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
