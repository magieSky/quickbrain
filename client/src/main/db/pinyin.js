const { pinyin } = require('pinyin-pro')

function pinyinInitials(text) {
  if (!text) return ''
  if (typeof text !== 'string') return ''
  const py = pinyin(text, {
    pattern: 'first',
    toneType: 'none',
    type: 'array'
  })
  return py.join('').toLowerCase().trim()
}

function generatePinyinForNote(title, content) {
  return {
    pinyinTitle: pinyinInitials(title || ''),
    pinyinContent: pinyinInitials(content || '')
  }
}

module.exports = { pinyinInitials, generatePinyinForNote }
