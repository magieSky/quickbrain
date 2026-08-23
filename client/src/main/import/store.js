const path = require('path')
const { convert } = require('./markitdown')
const { addNote } = require('../db/search')

async function importDocument(db, filePath) {
  const result = await convert(filePath)
  const id = addNote(db, {
    title: result.title,
    content: result.content,
    source_path: filePath,
    source_type: result.sourceType,
    category: 'uncategorized',
    tags: [],
    is_formatted: 0,
    original_content: ''
  })
  return {
    id,
    title: result.title,
    sourcePath: filePath,
    sourceType: result.sourceType,
    totalChars: result.totalChars,
    uniqueId: result.uniqueId
  }
}

module.exports = { importDocument }