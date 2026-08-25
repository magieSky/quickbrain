// Collect sources (notes + URLs + files) for the report composer.
// Returns a normalized array: [{id, kind, title, content, tokens}].
// \`kind\` is one of: 'note' | 'url' | 'file'.
// Tokens are estimated (chars/4) since we do not call a real tokenizer.

const http = require('http')
const https = require('https')
const { URL } = require('url')
const { getDB } = require('../db-init')
const { getNoteById } = require('../db/search')
const markitdown = require('../import/markitdown')

const MAX_SOURCE_CHARS = 50_000       // per-source cap (truncate with marker)
const MAX_URL_FETCH_BYTES = 2_000_000 // 2 MB safety cap for URL fetch

function estimateTokens(s) {
  // Chinese mixes ~1.5 chars/token, English ~4 chars/token. /3.5 is a good middle ground.
  return Math.ceil((s || '').length / 3.5)
}

function truncate(s, max = MAX_SOURCE_CHARS) {
  if (!s) return s
  if (s.length <= max) return s
  return s.slice(0, max) + '\n\n[...内容过长已截断...]'
}

function noteTitle(n) {
  return n.title || (n.content || '').split('\n')[0].trim().slice(0, 80) || '(无标题)'
}

// ---- Notes ----
async function collectNotes(ids) {
  const db = getDB()
  const out = []
  for (const id of ids) {
    const n = getNoteById(db, id)
    if (!n) continue
    const content = truncate(n.content || '')
    out.push({
      id: 'note:' + n.id,
      kind: 'note',
      title: noteTitle(n),
      content,
      tokens: estimateTokens(content),
      updatedAt: n.updated_at || null
    })
  }
  return out
}

// ---- URLs ----
function fetchUrl(rawUrl, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let url
    try { url = new URL(rawUrl) } catch (e) { return reject(new Error('invalid-url: ' + rawUrl)) }
    const lib = url.protocol === 'https:' ? https : http
    const req = lib.get(url, { timeout: timeoutMs, headers: { 'User-Agent': 'QuickBrain/1.0' } }, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // follow one redirect
        return resolve(fetchUrl(new URL(res.headers.location, url).toString(), timeoutMs))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error('http ' + res.statusCode))
      }
      let size = 0
      const chunks = []
      res.on('data', c => {
        size += c.length
        if (size > MAX_URL_FETCH_BYTES) { req.destroy(new Error('response-too-large')); return }
        chunks.push(c)
      })
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('fetch-timeout')))
    req.on('error', reject)
  })
}

// Strip HTML to plain text. Not a full Readability clone — good enough for
// most docs / blog posts. Keeps paragraph breaks.
function htmlToText(html) {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
  // Block-level close tags → paragraph break
  s = s.replace(/<\/(p|div|section|article|header|footer|h[1-6]|li|tr|br|hr)\s*\/?>/gi, '\n')
  // Drop remaining tags
  s = s.replace(/<[^>]+>/g, '')
  // Decode common entities
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
       .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  // Collapse whitespace but preserve blank lines
  s = s.split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n')
  return s
}

async function collectUrls(urls) {
  const out = []
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    try {
      const raw = await fetchUrl(url)
      let content
      try { content = htmlToText(raw) } catch (_) { content = raw }
      content = truncate(content)
      out.push({
        id: 'url:' + i + ':' + url,
        kind: 'url',
        title: url,
        content,
        tokens: estimateTokens(content)
      })
    } catch (e) {
      out.push({ id: 'url:err:' + i, kind: 'url', title: url, content: '(抓取失败: ' + e.message + ')', tokens: 0 })
    }
  }
  return out
}

// ---- Files ----
async function collectFiles(filePaths) {
  const out = []
  for (let i = 0; i < filePaths.length; i++) {
    const fp = filePaths[i]
    try {
      if (!markitdown.isSupported(fp)) {
        out.push({ id: 'file:err:' + i, kind: 'file', title: fp, content: '(不支持的文件类型)', tokens: 0 })
        continue
      }
      const md = await markitdown.convert(fp)
      const content = truncate(md)
      out.push({
        id: 'file:' + i + ':' + fp,
        kind: 'file',
        title: require('path').basename(fp),
        content,
        tokens: estimateTokens(content)
      })
    } catch (e) {
      out.push({ id: 'file:err:' + i, kind: 'file', title: fp, content: '(解析失败: ' + e.message + ')', tokens: 0 })
    }
  }
  return out
}

async function collectSources({ noteIds = [], urls = [], filePaths = [] } = {}) {
  const [notes, us, files] = await Promise.all([
    collectNotes(noteIds),
    collectUrls(urls),
    collectFiles(filePaths)
  ])
  return [...notes, ...us, ...files]
}

module.exports = {
  collectSources,
  collectNotes,
  collectUrls,
  collectFiles,
  estimateTokens,
  htmlToText,
  fetchUrl,
  MAX_SOURCE_CHARS
}
