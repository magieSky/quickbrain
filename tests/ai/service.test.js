import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn()
}))

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } }
  }))
}))

import { AIService } from '../../client/src/main/ai/service.mjs'

describe('ai service', () => {
  let service

  beforeEach(() => {
    service = new AIService({
      apiKey: 'test-key',
      baseURL: 'https://test.api',
      model: 'test-model',
      defaultStyle: 'summary'
    })
    mockCreate.mockReset()
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

  it('categorizeContent falls back to 其他 on API error', async () => {
    mockCreate.mockRejectedValue(new Error('rate limit'))

    const result = await service.categorizeContent('foo')
    expect(result.category).toBe('其他')
    expect(result.tags).toEqual([])
    expect(result.error).toBe('rate limit')
  })

  it('categorizeContent handles malformed JSON', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'not json {' } }] })

    const result = await service.categorizeContent('foo')
    expect(result.category).toBe('其他')
  })

  it('semanticSearch returns matched IDs', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"matchedIds":[1,3,5],"reasoning":"relevance"}' } }]
    })

    const result = await service.semanticSearch('query', ['note 1', 'note 3', 'note 5'])
    expect(result.matchedIds).toEqual([1, 3, 5])
    expect(result.reasoning).toBe('relevance')
  })

  it('semanticSearch returns error info on API failure', async () => {
    mockCreate.mockRejectedValue(new Error('timeout'))

    const result = await service.semanticSearch('q', ['a'])
    expect(result.matchedIds).toEqual([])
    expect(result.error).toContain('timeout')
  })
})