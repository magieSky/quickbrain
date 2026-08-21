import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AIService } from '../../main/ai/service.js'

// Mock OpenAI
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn()
        }
      }
    }))
  }
})

describe('ai service', () => {
  let service
  let mockCreate

  beforeEach(() => {
    service = new AIService({
      apiKey: 'test-key',
      baseURL: 'https://test.api',
      model: 'test-model',
      defaultStyle: 'summary'
    })
    mockCreate = service.client.chat.completions.create
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

  it('semanticSearch returns matched IDs', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"matchedIds":[1,3,5],"reasoning":"relevance"}' } }]
    })

    const result = await service.semanticSearch('query', ['note 1', 'note 3', 'note 5'])
    expect(result.matchedIds).toEqual([1, 3, 5])
    expect(result.reasoning).toBe('relevance')
  })
})
