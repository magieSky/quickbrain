import { describe, it, expect } from 'vitest'
import providers from '../shared/types/providers.js'

describe('shared/types/providers', () => {
  it('exports the same providers the client uses', () => {
    expect(Array.isArray(providers.PROVIDERS)).toBe(true)
    expect(providers.PROVIDERS.length).toBeGreaterThanOrEqual(4)
    expect(providers.PROVIDERS.find(p => p.id === 'MiniMax')).toBeTruthy()
    expect(providers.PROVIDERS.find(p => p.id === 'ollama')).toBeTruthy()
  })

  it('provider entries have a stable shape', () => {
    for (const p of providers.PROVIDERS) {
      expect(p.id).toBeTruthy()
      expect(p.name).toBeTruthy()
      expect(p.baseURL).toBeTruthy()
      expect(typeof p.requiresApiKey).toBe('boolean')
    }
  })

  it('getProvider returns a single provider by id', () => {
    expect(providers.getProvider('MiniMax').name).toBeTruthy()
    expect(providers.getProvider('does-not-exist')).toBeUndefined()
  })
})