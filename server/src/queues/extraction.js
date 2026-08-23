const { Queue, Worker, QueueEvents } = require('bullmq')
const IORedis = require('ioredis')

const QUEUE_NAME = 'extract'

let _queue = null
let _worker = null
let _events = null

function makeConnection(redisUrl) {
  // BullMQ requires maxRetriesPerRequest: null on the connection.
  return new IORedis(redisUrl, { maxRetriesPerRequest: null })
}

function getQueue(redisUrl) {
  if (_queue) return _queue
  _queue = new Queue(QUEUE_NAME, { connection: makeConnection(redisUrl) })
  return _queue
}

async function enqueue(clientId, opts = {}) {
  if (!clientId) throw new Error('clientId required')
  const q = getQueue(opts.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379')
  await q.add('extract', { clientId }, {
    jobId: 'extract:' + clientId + ':' + Date.now(),
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86400 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }
  })
  return true
}

async function startWorker({ redisUrl, runJob }) {
  if (_worker) return _worker
  const conn = makeConnection(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379')
  _events = new QueueEvents(QUEUE_NAME, { connection: makeConnection(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379') })
  await _events.waitUntilReady().catch(() => {})
  _worker = new Worker(QUEUE_NAME, async (job) => {
    const clientId = job.data && job.data.clientId
    if (!clientId) return { skipped: 'no-client-id' }
    return await runJob(clientId, { force: false })
  }, { connection: conn, concurrency: 2 })
  return _worker
}

async function stopAll() {
  if (_worker) { try { await _worker.close() } catch (_) {} ; _worker = null }
  if (_events) { try { await _events.close() } catch (_) {} ; _events = null }
  if (_queue) { try { await _queue.close() } catch (_) {} ; _queue = null }
}

module.exports = { QUEUE_NAME, getQueue, enqueue, startWorker, stopAll }