import { describe, it, expect } from 'vitest'

const queueUrl = 'file:///' + require('node:path').resolve('server/src/queues/extraction.js').replace(/\\/g, '/')

describe('server/src/queues/extraction module', () => {
  it('loads and exports the expected API', async () => {
    const mod = await import(queueUrl + '?t=' + Date.now())
    expect(mod.QUEUE_NAME).toBe('extract')
    expect(typeof mod.enqueue).toBe('function')
    expect(typeof mod.startWorker).toBe('function')
    expect(typeof mod.stopAll).toBe('function')
    expect(typeof mod.getQueue).toBe('function')
  })

  it('enqueue throws when clientId missing', async () => {
    const mod = await import(queueUrl + '?t=' + (Date.now() + 1))
    await expect(mod.enqueue()).rejects.toThrow(/clientId required/)
    await expect(mod.enqueue(null)).rejects.toThrow(/clientId required/)
  })
})