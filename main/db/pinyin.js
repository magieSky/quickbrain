const { pinyin } = require('pinyin-pro')

function pinyinInitials(text) {
  if (!text) return ''
  const arr = pinyin(text, {
    pattern: 'first',
    toneType: 'none',
    type: 'array'
  })
  return arr.join('').toLowerCase().trim()
}

function generatePinyinForNote(title, content) {
  return {
    pinyinTitle: pinyinInitials(title || ''),
    pinyinContent: pinyinInitials(content || '')
  }
}

module.exports = { pinyinInitials, generatePinyinForNote }