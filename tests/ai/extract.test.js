import { describe, it, expect } from 'vitest'
import { buildExtractPrompt, parseAtomJson, MAX_CONTENT_CHARS } from '../../main/ai/extract.js'

describe('extract prompt', () => {
  it('truncates content to MAX_CONTENT_CHARS', () => {
    const long = 'a'.repeat(MAX_CONTENT_CHARS + 100)
    const p = buildExtractPrompt('t', long)
    expect(p.user).toContain('a'.repeat(100))
    expect(p.user).not.toContain('a'.repeat(MAX_CONTENT_CHARS + 1))
  })

  it('uses provided title or placeholder', () => {
    expect(buildExtractPrompt('Hello', 'c').user).toContain('Document title: Hello')
    expect(buildExtractPrompt('', 'c').user).toContain('Document title: (untitled)')
  })
})

describe('parseAtomJson', () => {
  it('parses clean array', () => {
    const r = parseAtomJson('[{"title":"A","content":"B","source_range":{"start":1,"end":5}}]')
    expect(r.length).toBe(1)
    expect(r[0].title).toBe('A')
    expect(r[0].content).toBe('B')
    expect(r[0].source_range).toEqual({ start: 1, end: 5 })
  })

  it('strips json fences', () => {
    const r = parseAtomJson('```json\n[{"title":"A","content":"B","source_range":{"start":1,"end":5}}]\n```')
    expect(r.length).toBe(1)
    expect(r[0].title).toBe('A')
  })

  it('falls back to bracket extraction on garbage prefix', () => {
    const r = parseAtomJson('leading garbage [{"title":"A","content":"B","source_range":{}}] trailing')
    expect(r.length).toBe(1)
  })

  it('returns empty on invalid input', () => {
    expect(parseAtomJson('')).toEqual([])
    expect(parseAtomJson(null)).toEqual([])
    expect(parseAtomJson(undefined)).toEqual([])
    expect(parseAtomJson('no json here')).toEqual([])
  })

  it('filters out atoms missing title or content', () => {
    const r = parseAtomJson('[{"title":"A","content":"B"},{"title":"X"},{"content":"Y"}]')
    expect(r.length).toBe(1)
    expect(r[0].title).toBe('A')
  })

  it('truncates long titles and contents', () => {
    const r = parseAtomJson(JSON.stringify([{ title: 'T'.repeat(200), content: 'C'.repeat(800), source_range: {} }]))
    expect(r[0].title.length).toBe(100)
    expect(r[0].content.length).toBe(500)
  })
})