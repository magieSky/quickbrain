const fs = require('fs')
const path = require('path')
const os = require('os')
const https = require('https')
const { URL } = require('url')

const MARKITDOWN_HOST = 'tool.bjhzsk.cn'
const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 MB

// supported file extensions on tool.bjhzsk.cn
const SUPPORTED_EXTS = new Set([
  'avi', 'bmp', 'csv', 'docx', 'epub', 'gif', 'htm', 'html',
  'jpeg', 'jpg', 'mp3', 'mp4', 'pdf', 'png', 'pptx', 'txt',
  'wav', 'xls', 'xlsx'
])

function isSupported(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  return SUPPORTED_EXTS.has(ext)
}

function getFileInfo(filePath) {
  const stat = fs.statSync(filePath)
  if (!stat.isFile()) throw new Error('不是一个文件: ' + filePath)
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error('文件超过 50MB 上限: ' + filePath)
  }
  return { ext: path.extname(filePath).slice(1).toLowerCase(), size: stat.size, name: path.basename(filePath) }
}

function postMultipart(host, filePath) {
  return new Promise((resolve, reject) => {
    const { ext, size, name } = getFileInfo(filePath)
    const boundary = '----QBFormBoundary' + Math.random().toString(36).slice(2)
    const filename = name

    const head = Buffer.from(
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="file"; filename="' + filename + '"\r\n' +
      'Content-Type: application/octet-stream\r\n\r\n'
    )
    const tail = Buffer.from('\r\n--' + boundary + '--\r\n')
    const body = Buffer.concat([head, fs.readFileSync(filePath), tail])

    const req = https.request({
      host,
      path: '/convert',
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': body.length
      },
      timeout: 120000
    }, (res) => {
      let chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if (res.statusCode !== 200) {
          return reject(new Error('markitdown HTTP ' + res.statusCode + ': ' + text.slice(0, 200)))
        }
        try {
          resolve(JSON.parse(text))
        } catch (e) {
          reject(new Error('markitdown 返回非 JSON: ' + text.slice(0, 200)))
        }
      })
    })
    req.on('timeout', () => req.destroy(new Error('markitdown 请求超时')))
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function deriveTitle(fileName, markdown) {
  const ext = path.extname(fileName)
  const stem = path.basename(fileName, ext)
  const m = markdown && markdown.match(/^#\s+(.+)$/m)
  return m ? m[1].trim().slice(0, 120) : stem
}

async function convert(filePath) {
  if (!fs.existsSync(filePath)) throw new Error('文件不存在: ' + filePath)
  if (!isSupported(filePath)) {
    throw new Error('不支持的文件类型: ' + path.extname(filePath) + '（支持: ' + Array.from(SUPPORTED_EXTS).join(', ') + '）')
  }
  const result = await postMultipart(MARKITDOWN_HOST, filePath)
  if (!result.success) throw new Error('markitdown 转换失败: ' + (result.detail || JSON.stringify(result)))
  const markdown = result.markdown_preview || ''
  const title = deriveTitle(result.file_name, markdown)
  return {
    title,
    content: markdown,
    sourceType: path.extname(filePath).slice(1).toLowerCase(),
    sourceName: result.file_name,
    totalChars: result.total_chars || markdown.length,
    uniqueId: result.unique_id
  }
}

module.exports = { convert, isSupported, SUPPORTED_EXTS }