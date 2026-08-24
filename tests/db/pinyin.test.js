import { describe, it, expect } from 'vitest'
import { pinyinInitials, generatePinyinForNote } from '../../client/src/main/db/pinyin.js'

describe('pinyin', () => {
  it('pinyinInitials converts Chinese to initials', () => {
    expect(pinyinInitials('北京')).toBe('bj')
    expect(pinyinInitials('上海')).toBe('sh')
    expect(pinyinInitials('分布式锁')).toBe('fbss')
  })

  it('pinyinInitials preserves English and digits', () => {
    expect(pinyinInitials('Hello 北京 2024')).toBe('hello bj 2024')
  })

  it('pinyinInitials handles empty string', () => {
    expect(pinyinInitials('')).toBe('')
  })

  it('generatePinyinForNote returns title and content pinyin', () => {
    const result = generatePinyinForNote('React 笔记', '关于 React Hooks 的笔记')
    expect(result.pinyinTitle).toBe('react bj')
    expect(result.pinyinContent).toBe('gy react hooks dbj')
  })
})
