import { describe, it, expect } from 'vitest'
import { buildFormatPrompt, buildSemanticSearchPrompt } from '../../main/ai/prompts.mjs'

describe('prompts', () => {
  it('buildFormatPrompt returns summary prompt by default', () => {
    const p = buildFormatPrompt('hello world', 'summary')
    expect(p).toContain('hello world')
    expect(p).toContain('摘要')
  })

  it('buildFormatPrompt supports structured style', () => {
    const p = buildFormatPrompt('hello', 'structured')
    expect(p).toContain('结构化')
  })

  it('buildFormatPrompt supports tags style', () => {
    const p = buildFormatPrompt('hello', 'tags')
    expect(p).toContain('标签')
  })

  it('buildFormatPrompt supports mindmap style', () => {
    const p = buildFormatPrompt('hello', 'mindmap')
    expect(p).toContain('思维导图')
  })

  it('buildSemanticSearchPrompt includes query and notes', () => {
    const p = buildSemanticSearchPrompt('分布式锁', ['note 1', 'note 2'])
    expect(p).toContain('分布式锁')
    expect(p).toContain('note 1')
  })
})
