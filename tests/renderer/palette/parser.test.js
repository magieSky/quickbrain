import { describe, it, expect } from 'vitest'
import { parseInput, COMMAND_NAMES, STYLE_MAP } from '../../../client/src/renderer/palette/commands/parser.js'

describe('parseInput', () => {
  it('returns empty type for empty input', () => {
    const r = parseInput('')
    expect(r.type).toBe('empty')
  })

  it('returns empty type for whitespace-only input', () => {
    const r = parseInput('   ')
    expect(r.type).toBe('empty')
  })

  it('parses ? prefix as ai-search', () => {
    const r = parseInput('? 我之前看过的分布式锁')
    expect(r.type).toBe('ai-search')
    expect(r.query).toBe('我之前看过的分布式锁')
  })

  it('parses full-width ? prefix as ai-search', () => {
    const r = parseInput('？北京旅游攻略')
    expect(r.type).toBe('ai-search')
    expect(r.query).toBe('北京旅游攻略')
  })

  it('parses ai 摘要 keyword as ai-format with summary style', () => {
    const r = parseInput('ai 摘要 北京旅游')
    expect(r.type).toBe('ai-format')
    expect(r.style).toBe('summary')
    expect(r.keyword).toBe('北京旅游')
  })

  it('parses AI prefix (uppercase) as ai-format', () => {
    const r = parseInput('AI 结构化 学习笔记')
    expect(r.type).toBe('ai-format')
    expect(r.style).toBe('structured')
    expect(r.keyword).toBe('学习笔记')
  })

  it('parses exact command name without keyword', () => {
    const r = parseInput('打开设置')
    expect(r.type).toBe('command')
    expect(r.command).toBe('打开设置')
    expect(r.keyword).toBe('')
  })

  it('parses command name with keyword', () => {
    const r = parseInput('格式化 分布式锁')
    expect(r.type).toBe('command')
    expect(r.command).toBe('格式化')
    expect(r.keyword).toBe('分布式锁')
  })

  it('parses unknown input as new-content', () => {
    const r = parseInput('这是一段全新的笔记内容...')
    expect(r.type).toBe('new-content')
    expect(r.content).toBe('这是一段全新的笔记内容...')
  })

  it('exports 19 command names', () => {
    expect(COMMAND_NAMES.length).toBe(19)
  })

  it('exports STYLE_MAP with 4 styles', () => {
    expect(Object.keys(STYLE_MAP).length).toBe(4)
    expect(STYLE_MAP['摘要']).toBe('summary')
    expect(STYLE_MAP['结构化']).toBe('structured')
    expect(STYLE_MAP['标签']).toBe('tags')
    expect(STYLE_MAP['思维导图']).toBe('mindmap')
  })
})