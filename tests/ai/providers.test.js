import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { PROVIDERS, getProvider } = require('../../client/src/main/ai/providers.js')

describe('openrouter provider', () => {
  it('is registered in PROVIDERS', () => {
    expect(PROVIDERS.some(p => p.id === 'openrouter')).toBe(true)
  })

  it('has correct openai-compatible config', () => {
    const p = getProvider('openrouter')
    expect(p).toBeTruthy()
    expect(p.baseURL).toBe('https://openrouter.ai/api/v1')
    expect(p.defaultModel).toBe('openrouter/free')
    expect(p.requiresApiKey).toBe(true)
    expect(p.customModel).toBe(true)
  })
})
