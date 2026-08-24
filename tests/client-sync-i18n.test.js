import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Pull the translator out of main.js so we can test it in isolation, without
// having to load the whole renderer (which expects `window`, `els`, `api`,
// etc. globals that are not available in vitest).
function loadTranslator() {
  const src = fs.readFileSync(path.resolve('client/src/renderer/main/main.js'), 'utf8')
  const start = src.indexOf('const SYNC_ERROR_MESSAGES')
  const end = src.indexOf('function setStatus(text)')
  if (start < 0 || end < 0) throw new Error('SYNC_ERROR_MESSAGES / translateSyncError block not found in main.js')
  const block = src.slice(start, end)
  // eslint-disable-next-line no-new-func
  const factory = new Function(block + '; return { translateSyncError, SYNC_ERROR_MESSAGES };')
  return factory()
}

describe('client sync error translator (Chinese)', () => {
  const { translateSyncError, SYNC_ERROR_MESSAGES } = loadTranslator()

  it('translates every known server error code to a Chinese message', () => {
    const expectedKeys = [
      'invalid-username', 'invalid-password', 'username-taken',
      'invalid-credentials', 'wrong-password', 'no-such-user',
      'missing-fields', 'missing-server-url', 'missing-token',
      'unauthorized', 'invalid-response', 'network-error',
      'bootstrap-disabled', 'invalid-bootstrap-token', 'already-bootstrapped'
    ]
    for (const key of expectedKeys) {
      expect(SYNC_ERROR_MESSAGES[key], `missing Chinese message for ${key}`).toBeTruthy()
      expect(translateSyncError(key)).toBe(SYNC_ERROR_MESSAGES[key])
    }
  })

  it('falls back to a friendly Chinese message for http-XXX errors', () => {
    expect(translateSyncError('http-503')).toMatch(/HTTP 503/)
  })

  it('uses the table message even when the error carries extra detail', () => {
    // 'network-error' is mapped directly in the table, so the suffix is dropped
    // (the friendly Chinese copy is more useful than the raw detail).
    expect(translateSyncError('network-error: ECONNREFUSED')).toBe(SYNC_ERROR_MESSAGES['network-error'])
  })

  it('passes through unknown codes so we never hide debugging info', () => {
    expect(translateSyncError('something-else')).toBe('something-else')
  })

  it('returns 未知错误 for empty / nullish input', () => {
    expect(translateSyncError(null)).toBe('未知错误')
    expect(translateSyncError(undefined)).toBe('未知错误')
    expect(translateSyncError('')).toBe('未知错误')
  })
})
