import { buildExtractPrompt, parseAtomJson } from './extract.js'
import OpenAI from 'openai'
import { SYSTEM_PROMPT, CATEGORIZE_PROMPT, buildFormatPrompt, buildSemanticSearchPrompt, buildFieldExtractPrompt } from './prompts.mjs'
import { getProvider } from './providers.js'

function extractJSON(raw) {
  if (!raw) return null
  let s = String(raw).replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  try { return JSON.parse(s) } catch (_) {}
  const m = s.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch (_) {} }
  return null
}

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
        max_tokens: 2000,
        // formatting task: no thinking needed, save tokens + latency
        thinking: { type: 'disabled' }
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
        temperature: 0.3,
        // short classification task: no thinking needed, save tokens + latency
        thinking: { type: 'disabled' }
      })
      const parsed = extractJSON(response.choices[0].message.content)
      if (!parsed) throw new Error('LLM response is not valid JSON')
      return {
        category: parsed.category || '\u5176\u4ED6',
        tags: (parsed.tags || '').split(',').map(t => t.trim()).filter(t => t)
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
        temperature: 0.3,
        // MiniMax-M3 reasoning model: route thinking into reasoning_details, keep content clean
        reasoning_split: true
      })
      const msg = response.choices[0].message || {}
      const raw = msg.content || ''
      const reasoning = msg.reasoning_content || msg.reasoning_details || ''
      console.log('[ai semanticSearch] raw len=' + raw.length + ' reasoningLen=' + (typeof reasoning === 'string' ? reasoning.length : JSON.stringify(reasoning).length) + ' hasThinkTag=' + (/<think>/i.test(raw)))
      const parsed = extractJSON(raw)
      if (!parsed) throw new Error('LLM response is not valid JSON: ' + raw.substring(0, 120))
      console.log('[ai semanticSearch] parsed matchedIds=' + JSON.stringify(parsed.matchedIds))
      return {
        matchedIds: parsed.matchedIds || [],
        reasoning: parsed.reasoning || ''
      }
    } catch (error) {
      console.log('[ai semanticSearch] error: ' + error.message)
      return { matchedIds: [], reasoning: '', error: error.message }
    }
  }


  async aiExtract(query, candidateSummaries) {
    console.log('[ai aiExtract] provider=' + this.providerId + ' model=' + this.defaultModel + ' query=' + JSON.stringify(query) + ' candidates=' + (candidateSummaries || []).length)
    const userPrompt = buildFieldExtractPrompt(query, candidateSummaries)
    try {
      const response = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: [
          { role: 'system', content: '你是一个字段抽取助手。从候选笔记中抽取用户问到的字段值，找不到返回 NONE。' },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        reasoning_split: true
      })
      const msg = response.choices[0].message || {}
      const raw = msg.content || ''
      const parsed = extractJSON(raw)
      if (!parsed) throw new Error('LLM response is not valid JSON: ' + raw.substring(0, 120))
      const value = (parsed.value || '').toString().trim()
      if (!value || value.toUpperCase() === 'NONE') {
        console.log('[ai aiExtract] no value found')
        return { value: null, sourceId: null, confidence: 0 }
      }
      console.log('[ai aiExtract] value=' + JSON.stringify(value) + ' sourceId=' + parsed.sourceId + ' confidence=' + parsed.confidence)
      return {
        value,
        sourceId: parsed.sourceId != null ? Number(parsed.sourceId) : null,
        confidence: Number(parsed.confidence) || 0
      }
    } catch (error) {
      console.log('[ai aiExtract] error: ' + error.message)
      return { value: null, sourceId: null, confidence: 0, error: error.message }
    }
  }

  async extractAtoms({ title, content }) {
    if (!this.client) throw new Error('AI not configured')
    const { system, user } = buildExtractPrompt(title, content)
    try {
      const response = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0.3,
        max_tokens: 2000,
        thinking: { type: 'disabled' }
      })
      const raw = response.choices[0].message.content || ''
      return parseAtomJson(raw)
    } catch (error) {
      console.error('[ai extractAtoms] error:', error.message)
      throw error
    }
  }

  /**
   * Stream chat completion tokens via async generator.
   * Caller iterates and forwards chunks to UI for live preview.
   */
  async *chatStream({ system, user, temperature = 0.3, maxTokens = 4000 } = {}) {
    console.log('[ai chatStream] provider=' + this.providerId + ' model=' + this.defaultModel + ' maxTokens=' + maxTokens)
    try {
      const stream = await this.client.chat.completions.create({
        model: this.defaultModel,
        stream: true,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: user }
        ],
        temperature,
        max_tokens: maxTokens
      })
      for await (const chunk of stream) {
        const delta = chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].delta
        const content = delta && delta.content
        if (content) yield content
      }
    } catch (error) {
      console.error('[ai chatStream] error:' + error.message)
      throw error
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
