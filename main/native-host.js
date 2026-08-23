const fs = require('fs')
const net = require('net')

const PIPE = '\\\\.\\pipe\\quickbrain-native-bridge'
const { parseMessage } = require('./native-host-schema')

const input = fs.readFileSync(0, 'utf8') // stdin
const lines = input.split('\n')
const out = (obj) => process.stdout.write(JSON.stringify(obj) + '\n')

for (const line of lines) {
  const parsed = parseMessage(line)
  if (!parsed) continue
  if (parsed.error) { out({ success: false, error: parsed.error }); continue }
  const { msg } = parsed
  if (msg.type === 'ping') { out({ success: true, pong: 1 }); continue }
  const client = net.connect(PIPE)
  let buf = ''
  let timer = null
  client.on('connect', () => {
    timer = client.setTimeout(5000, () => client.destroy(new Error('pipe-timeout')))
    client.write(JSON.stringify(msg) + '\n')
  })
  const done = () => { if (timer) { clearTimeout(timer); timer = null } }
  client.on('data', (d) => { done(); buf += d.toString('utf8'); if (buf.includes('\n')) client.end() })
  client.on('timeout', () => out({ success: false, error: 'pipe-timeout' }))
  client.on('error', (e) => { done(); out({ success: false, error: 'pipe: ' + e.code }) })
  client.on('end', () => {
    done()
    let parsed
    try { parsed = buf.trim() ? JSON.parse(buf.trim()) : { success: false, error: 'no-response' } }
    catch (e) { parsed = { success: false, error: 'invalid-response-json' } }
    out(parsed)
  })
}
