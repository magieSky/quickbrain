const { spawn } = require('child_process')
const path = require('path')

const exe = process.argv[2] || path.join(__dirname, '..', 'dist', 'win-unpacked', 'QuickBrain.exe')
const fixture = process.argv[3] || 'ping'

const child = spawn(exe, ['--native-host'], { stdio: ['pipe', 'pipe', 'inherit'] })
child.stdout.on('data', (b) => process.stdout.write(b))
child.stdin.write(JSON.stringify({ type: fixture }) + '\n')
if (fixture === 'save-selection') {
  child.stdin.write(JSON.stringify({
    type: 'save-selection',
    payload: { text: 'hello world', title: 'Test selection', url: 'https://example.com/', tabTitle: 'Example' }
  }) + '\n')
}
child.stdin.end()
