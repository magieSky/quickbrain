// Minimal Markdown to HTML renderer (offline, no dependencies).
// Usage: const html = renderMarkdown(text)
(function () {
  if (window.renderMarkdown) return

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ESC[c])

  const ALLOWED = new Set(['b', 'strong', 'i', 'em', 'code', 'pre', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a'])

  function sanitizeHtml(html) {
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '')
    html = html.replace(/<style[\s\S]*?<\/style>/gi, '')
    html = html.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    html = html.replace(/<object[\s\S]*?<\/object>/gi, '')
    html = html.replace(/<embed[^>]*>/gi, '')
    html = html.replace(/on\w+\s*=\s*"[^"]*"/gi, '')
    html = html.replace(/on\w+\s*=\s*'[^']*'/gi, '')
    html = html.replace(/javascript\s*:/gi, '')
    html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, (m, tag) => {
      return ALLOWED.has(tag.toLowerCase()) ? m : ''
    })
    return html
  }

  function renderInline(text) {
    let s = esc(text)
    s = s.replace(/\x60([^\x60]+)\x60/g, '<code></code>')
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong></strong>')
    s = s.replace(/__([^_]+)__/g, '<strong></strong>')
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '<em></em>')
    s = s.replace(/(^|[^_])_([^_\n]+)_/g, '<em></em>')
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) => {
      if (/^(https?:|mailto:)/i.test(u.trim())) return '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>'
      return t
    })
    return s
  }

  window.renderMarkdown = function (text) {
    if (text == null) return ''
    const src = String(text).replace(/\r\n/g, '\n')
    const lines = src.split('\n')
    const out = []
    let inCode = false, codeBuf = [], listStack = [], paraBuf = []

    const flushPara = () => {
      if (paraBuf.length) {
        out.push('<p>' + renderInline(paraBuf.join(' ')) + '</p>')
        paraBuf = []
      }
    }
    const closeLists = (toLevel) => {
      while (listStack.length > toLevel) {
        out.push('</' + listStack.pop() + '>')
      }
    }

    for (const raw of lines) {
      const line = raw
      if (/^\s*\x60{3}/.test(line)) {
        if (inCode) {
          out.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>')
          codeBuf = []
          inCode = false
        } else {
          flushPara(); closeLists(0)
          inCode = true
        }
        continue
      }
      if (inCode) { codeBuf.push(line); continue }

      const h = line.match(/^(#{1,6})\s+(.+)$/)
      if (h) {
        flushPara(); closeLists(0)
        out.push('<h' + h[1].length + '>' + renderInline(h[2]) + '</h' + h[1].length + '>')
        continue
      }
      const ul = line.match(/^\s*[-*+]\s+(.+)$/)
      if (ul) {
        flushPara()
        if (!listStack.length || listStack[listStack.length - 1] !== 'ul') {
          closeLists(0); out.push('<ul>'); listStack.push('ul')
        }
        out.push('<li>' + renderInline(ul[1]) + '</li>')
        continue
      }
      const ol = line.match(/^\s*\d+\.\s+(.+)$/)
      if (ol) {
        flushPara()
        if (!listStack.length || listStack[listStack.length - 1] !== 'ol') {
          closeLists(0); out.push('<ol>'); listStack.push('ol')
        }
        out.push('<li>' + renderInline(ol[1]) + '</li>')
        continue
      }
      if (/^\s*$/.test(line)) {
        flushPara(); closeLists(0)
        continue
      }
      closeLists(0)
      paraBuf.push(line.trim())
    }
    flushPara(); closeLists(0)
    if (inCode && codeBuf.length) {
      out.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>')
    }
    return sanitizeHtml(out.join('\n'))
  }
})()