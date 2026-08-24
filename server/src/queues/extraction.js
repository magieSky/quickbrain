const { Queue, Worker, QueueEvents } = require('bullmq')
const IORedis = require('ioredis')

const QUEUE_NAME = 'extract'
const CONNECT_TIMEOUT_MS = 1500
const RETRY_DELAY_MS = 5000

let _queue = null
let _worker = null
let _events = null

function makeConnection(redisUrl) {
  // BullMQ requires maxRetriesPerRequest: null on the connection.
  // We add connectTimeout so a missing Redis fails fast instead of hanging
  // the entire sync/push route when the worker isn't running yet.
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    connectTimeout: CONNECT_TIMEOUT_MS,
    enableOfflineQueue: false
  })
}

function getQueue(redisUrl) {
  if (_queue) return _queue
  _queue = new Queue(QUEUE_NAME, {
    connection: makeConnection(redisUrl),
    defaultJobOptions: {
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 86400 },
      attempts: 3,
      backoff: { type: 'exponential', delay: RETRY_DELAY_MS }
    }
  })
  return _queue
}

async function enqueue(clientId, opts = {}) {
  if (!clientId) throw new Error('clientId required')
  const q = getQueue(opts.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379')
  // Best-effort: if Redis is down we don't want to block sync/push forever.
  // Race the add() against a connectTimeout so the route returns promptly.
  const addPromise = q.add('extract', { clientId }, {
    jobId: 'extract:' + clientId + ':' + Date.now()
  })
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('redis-enqueue-timeout')), CONNECT_TIMEOUT_MS)
  })
  try {
    return await Promise.race([addPromise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function startWorker({ redisUrl, runJob }) {
  if (_worker) return _worker
  const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379'
  const conn = makeConnection(url)
  _events = new QueueEvents(QUEUE_NAME, { connection: makeConnection(url) })
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
