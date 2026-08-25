import { describe, it, expect } from 'vitest'
import { pickStrategy, clusterSources, DIRECT_LIMIT, MAPREDUCE_LIMIT } from '../../client/src/main/compose/strategy.js'

describe('pickStrategy', () => {
  it('returns direct for small inputs', () => {
    expect(pickStrategy(0)).toBe('direct')
    expect(pickStrategy(DIRECT_LIMIT)).toBe('direct')
    expect(pickStrategy(1000)).toBe('direct')
  })
  it('returns mapReduce for medium inputs', () => {
    expect(pickStrategy(DIRECT_LIMIT + 1)).toBe('mapReduce')
    expect(pickStrategy(MAPREDUCE_LIMIT)).toBe('mapReduce')
  })
  it('returns hierarchical for very large inputs', () => {
    expect(pickStrategy(MAPREDUCE_LIMIT + 1)).toBe('hierarchical')
    expect(pickStrategy(10_000_000)).toBe('hierarchical')
  })
})

describe('clusterSources', () => {
  it('returns one cluster per source when nothing overlaps', () => {
    const srcs = [
      { title: 'a', content: 'alpha' },
      { title: 'b', content: 'beta' },
      { title: 'c', content: 'gamma' }
    ]
    const c = clusterSources(srcs)
    expect(c.length).toBe(3)
  })
  it('groups Chinese sources that share keywords', () => {
    const srcs = [
      { title: 'deepseek 启动命令', content: 'curl https://api.deepseek.com 端口 8080' },
      { title: 'deepseek 密钥', content: 'sk-abc-12345' },
      { title: '服务器 IP 地址', content: '117.72.162.39' },
      { title: '天气预报', content: '今天北京晴天 25度' }
    ]
    const c = clusterSources(srcs)
    // deepseek entries should be in the same cluster; weather/IP separate.
    const flat = c.flat()
    const deepseekCluster = c.find(cluster => cluster.length === 2)
    expect(deepseekCluster).toBeDefined()
    expect(deepseekCluster).toContain(0)
    expect(deepseekCluster).toContain(1)
  })
  it('returns one empty cluster list for empty input', () => {
    expect(clusterSources([])).toEqual([])
  })
})
