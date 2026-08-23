const net = require('net')
const PIPE = '\\\\.\\pipe\\quickbrain-native-bridge'

function startServer(handler) {
  return net.createServer((socket) => {
    let buf = ''
    socket.on('data', (d) => {
      buf += d.toString('utf8')
      if (buf.length > 1 << 20) { socket.destroy(); return }
      let nl = buf.indexOf('\n')
      while (nl >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        try { handler(JSON.parse(line), socket) } catch (e) { /* ignore malformed */ }
        nl = buf.indexOf('\n')
      }
    })
    socket.on('error', () => {})
  }).listen(PIPE, () => {})
    .on('error', (e) => console.error('[pipe] listen failed:', e.code || e.message))
}

module.exports = { startServer, PIPE }