import OpenAI from 'openai'
import { SYSTEM_PROMPT, CATEGORIZE_PROMPT, buildFormatPrompt, buildSemanticSearchPrompt } from './prompts.mjs'
import { getProvider } from './providers.js'

export class AIService {
  constructor(config = {}) {
    const provider = getProvider(config.provider) || getProvider('deepseek')
    this.providerId = provider.id
    this.providerName = provider.name
    this.defaultModel = config.model || provider.defaultModel
    this.defaultStyle = config.defaultStyle || 'summary'

    const baseURL = config.baseURL || provider.baseURL
    const apiKey = provider.requiresApiKey
      ? (config.apiKey || '')
      : (config.apiKey || 'ollama')

    this.client = new OpenAI({ apiKey, baseURL })
  }

  getInfo() {
    return {
      provider: this.providerId,
      providerName: this.providerName,
      model: this.defaultModel
    }
  }

  async formatContent(content, style = null) {
    const selectedStyle = style || this.defaultStyle
    const userPrompt = buildFormatPrompt(content, selectedStyle)
    try {
      const response = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
      return { success: true, formattedContent: response.choices[0].message.content.trim() }
    } catch (error) {
      return { success: false, error: error.message || '\u683C\u5F0F\u5316\u5931\u8D25' }
    }
  }

  async categorizeContent(content) {
    try {
      const response = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: [
          { role: 'system', content: CATEGORIZE_PROMPT },
          { role: 'user', content: (content || '').substring(0, 1000) }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3
      })
      const result = JSON.parse(response.choices[0].message.content)
      return {
        category: result.category || '\u5176\u4ED6',
        tags: (result.tags || '').split(',').map(t => t.trim()).filter(t => t)
      }
    } catch (error) {
      return { category: '\u5176\u4ED6', tags: [], error: error.message }
    }
  }

  async semanticSearch(query, candidateSummaries) {
    console.log('[ai semanticSearch] provider=' + this.providerId + ' model=' + this.defaultModel + ' query=' + JSON.stringify(query) + ' candidates=' + (candidateSummaries || []).length)
    const userPrompt = buildSemanticSearchPrompt(query, candidateSummaries)
    try {
      const response = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: [
          { role: 'system', content: '\u4F60\u662F\u4E00\u4E2A\u8BED\u4E49\u641C\u7D22\u52A9\u624B\u3002\u8BF7\u5206\u6790\u7528\u6237\u67E5\u8BE2\uFF0C\u4ECE\u5019\u9009\u7B14\u8BB0\u4E2D\u8FD4\u56DE\u6700\u76F8\u5173\u7684\u7B14\u8BB0\u3002' },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3
      })
      const raw = response.choices[0].message.content
      console.log('[ai semanticSearch] raw response len=' + raw.length + ' preview=' + raw.substring(0, 200))
      const result = JSON.parse(raw)
      console.log('[ai semanticSearch] parsed matchedIds=' + JSON.stringify(result.matchedIds))
      return {
        matchedIds: result.matchedIds || [],
        reasoning: result.reasoning || ''
      }
    } catch (error) {
      console.log('[ai semanticSearch] error: ' + error.message)
      return { matchedIds: [], reasoning: '', error: error.message }
    }
  }

  async testConnection() {
    try {
      const response = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5
      })
      return { success: true, message: '\u8FDE\u63A5\u6210\u529F' }
    } catch (error) {
      return { success: false, error: error.message || '\u8FDE\u63A5\u5931\u8D25' }
    }
  }
}
