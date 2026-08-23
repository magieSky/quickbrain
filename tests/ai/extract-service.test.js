import { describe, it, expect, vi } from 'vitest'

async function makeService(stubCreate) {
  const { AIService } = await import('../../main/ai/service.mjs')
  const svc = new AIService({ provider: 'openai', apiKey: 'k', model: 'm' })
  svc.client = { chat: { completions: { create: stubCreate } } }
  return svc
}

describe('AIService.extractAtoms', () => {
  it('throws when AI not configured', async () => {
    const { AIService } = await import('../../main/ai/service.mjs')
    const svc = new AIService({})
    svc.client = null
    await expect(svc.extractAtoms({ title: 't', content: 'c' })).rejects.toThrow('AI not configured')
  })

  it('returns parsed atoms on success', async () => {
    const stub = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '[{"title":"A","content":"B","source_range":{"start":0,"end":10}}]' } }]
    })
    const svc = await makeService(stub)
    const r = await svc.extractAtoms({ title: 't', content: '0123456789' })
    expect(r[0].title).toBe('A')
    expect(r[0].source_range).toEqual({ start: 0, end: 10 })
  })

  it('returns empty array on parse failure', async () => {
    const stub = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'not json at all' } }]
    })
    const svc = await makeService(stub)
    const r = await svc.extractAtoms({ title: 't', content: 'c' })
    expect(r).toEqual([])
  })

  it('rethrows on API error', async () => {
    const stub = vi.fn().mockRejectedValue(new Error('boom'))
    const svc = await makeService(stub)
    await expect(svc.extractAtoms({ title: 't', content: 'c' })).rejects.toThrow('boom')
  })
})