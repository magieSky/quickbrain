const net = require('net')
const PIPE = '\\\\.\\pipe\\quickbrain-native-bridge'

function startServer(handler) {
  return net.createServer((socket) => {
    let buf = ''
    socket.on('data', (d) => {
      buf += d.toString('utf8')
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
}

module.exports = { startServer, PIPE }
