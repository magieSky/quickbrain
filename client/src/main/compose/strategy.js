// Report composer: pick a strategy based on total tokens, then synthesize.
// Strategies:
//   - direct           (<=60K tokens): 1 call, stream chunks back as they arrive
//   - mapReduce        (60K-200K):     parallel summary pass + 1 final pass, streamed
//   - hierarchical     (>200K):        FTS5-keyword cluster + per-cluster map + reduce, streamed
//
// Streams tokens to an async callback onChunk(text) so the renderer can show
// live preview. Returns the full assembled string at the end.

const { estimateTokens } = require('../fetch/sources')

const DIRECT_LIMIT = 60000
const MAPREDUCE_LIMIT = 200000

const SYSTEM_PROMPT = [
  '你是一名专业的中文写作助手，擅长把多源材料整合成结构化的报告。',
  '- 按用户提示词的要求组织内容',
  '- 在引用具体事实/数字/命令时用 [来源N] 标注来源',
  '- 保留来源中的关键事实、命令、URL、专有名词',
  '- 输出 Markdown 格式'
].join("\n")

const SUMMARIZER_PROMPT = [
  '你是一名摘要助手。给定一份文档，提取对最终报告有用的关键事实。',
  '- 输出不超过 200 字',
  '- 保留具体数字、命令、URL、专有名词',
  '- 不要复述背景，只保留 facts',
  '- 第一行：≤15 字的标题；其余为要点列表'
].join("\n")

function pickStrategy(totalTokens) {
  if (totalTokens <= DIRECT_LIMIT) return "direct"
  if (totalTokens <= MAPREDUCE_LIMIT) return "mapReduce"
  return "hierarchical"
}

function buildSourcesBlock(sources) {
  return sources.map(function (s, i) {
    var idx = i + 1
    return "[来源" + idx + "] 类型=" + s.kind + " 标题=" + s.title + "\n" + s.content
  }).join("\n\n---\n\n")
}

function buildReducedBlock(summaries, originals) {
  return summaries.map(function (s, i) {
    var idx = i + 1
    return "[来源" + idx + "] 标题=" + originals[i].title + "\n摘要:\n" + s
  }).join("\n\n---\n\n")
}

async function mapSummaries(aiService, sources, onLog) {
  var summaries = new Array(sources.length)
  var tasks = sources.map(async function (src, i) {
    var t0 = Date.now()
    try {
      var acc = ""
      for await (var chunk of aiService.chatStream({
        system: SUMMARIZER_PROMPT,
        user: "文档内容:\n" + src.content,
        temperature: 0.1,
        maxTokens: 500
      })) { acc += chunk }
      summaries[i] = acc.trim()
      if (onLog) onLog("map:" + (i + 1) + "/" + sources.length + " ok (" + (Date.now() - t0) + "ms)")
    } catch (e) {
      summaries[i] = "(摘要失败: " + e.message + ")"
      if (onLog) onLog("map:" + (i + 1) + " failed: " + e.message)
    }
  })
  await Promise.all(tasks)
  return summaries
}

function clusterSources(sources) {
  function bag(text) {
    var t = (text || "").toLowerCase()
    var out = new Map()
    var words = t.match(/[a-z0-9]+/g) || []
    for (var i = 0; i < words.length; i++) {
      var w = words[i]
      if (w.length >= 3) out.set(w, (out.get(w) || 0) + 1)
    }
    var cjk = t.match(/[一-鿿]+/g) || []
    for (var s = 0; s < cjk.length; s++) {
      var seg = cjk[s]
      for (var k = 0; k < seg.length - 1; k++) {
        var g = seg.substr(k, 2)
        out.set(g, (out.get(g) || 0) + 1)
      }
    }
    return out
  }
  function jaccard(a, b) {
    var inter = 0, uni = 0
    for (var entry of a) {
      uni += entry[1]
      if (b.has(entry[0])) inter += Math.min(entry[1], b.get(entry[0]))
    }
    for (var entry2 of b) if (!a.has(entry2[0])) uni += entry2[1]
    return uni === 0 ? 0 : inter / uni
  }
  var bags = sources.map(function (s) { return bag(s.title + " " + s.content.slice(0, 2000)) })
  var clusters = []
  var assigned = new Array(sources.length).fill(false)
  for (var i = 0; i < sources.length; i++) {
    if (assigned[i]) continue
    var cluster = [i]
    assigned[i] = true
    for (var j = i + 1; j < sources.length; j++) {
      if (assigned[j]) continue
      var sim = jaccard(bags[i], bags[j])
      if (sim >= 0.05) { cluster.push(j); assigned[j] = true }
    }
    clusters.push(cluster)
  }
  return clusters
}

async function composeDirect(aiService, sources, prompt, onChunk, onLog) {
  if (onLog) onLog("strategy=direct sources=" + sources.length)
  var user = "提示词:\n" + prompt + "\n\n材料:\n" + buildSourcesBlock(sources)
  for await (var chunk of aiService.chatStream({
    system: SYSTEM_PROMPT,
    user: user,
    temperature: 0.5,
    maxTokens: 4000
  })) {
    if (onChunk) onChunk(chunk)
  }
}

async function composeMapReduce(aiService, sources, prompt, onChunk, onLog) {
  if (onLog) onLog("strategy=mapReduce sources=" + sources.length)
  var summaries = await mapSummaries(aiService, sources, onLog)
  var user = "提示词:\n" + prompt + "\n\n材料摘要:\n" + buildReducedBlock(summaries, sources)
  for await (var chunk of aiService.chatStream({
    system: SYSTEM_PROMPT,
    user: user,
    temperature: 0.5,
    maxTokens: 4000
  })) {
    if (onChunk) onChunk(chunk)
  }
}

async function composeHierarchical(aiService, sources, prompt, onChunk, onLog) {
  if (onLog) onLog("strategy=hierarchical sources=" + sources.length)
  var clusters = clusterSources(sources)
  if (onLog) onLog("clusters=" + clusters.length + " sizes=" + clusters.map(function (c) { return c.length }).join(","))
  var allSummaries = new Array(sources.length)
  await Promise.all(clusters.map(async function (cluster, ci) {
    var subset = cluster.map(function (i) { return sources[i] })
    var sums = await mapSummaries(aiService, subset, function (m) { if (onLog) onLog("cluster" + ci + ": " + m) })
    cluster.forEach(function (srcIdx, k) { allSummaries[srcIdx] = sums[k] })
  }))
  var groupedText = clusters.map(function (cluster, ci) {
    var items = cluster.map(function (i) {
      return "[来源" + (i + 1) + "] 标题=" + sources[i].title + "\n" + allSummaries[i]
    }).join("\n\n")
    return "## 主题组 " + (ci + 1) + "\n" + items
  }).join("\n\n")
  var user = "提示词:\n" + prompt + "\n\n聚合后的材料:\n" + groupedText
  for await (var chunk of aiService.chatStream({
    system: SYSTEM_PROMPT,
    user: user,
    temperature: 0.5,
    maxTokens: 4000
  })) {
    if (onChunk) onChunk(chunk)
  }
}

async function composeReport(aiService, sources, prompt, onChunk, onLog) {
  if (!sources || sources.length === 0) {
    if (onChunk) onChunk("(没有可用材料)")
    return { strategy: "none", text: "(没有可用材料)" }
  }
  var total = sources.reduce(function (s, x) { return s + (x.tokens || 0) }, 0)
  var strategy = pickStrategy(total)
  var acc = ""
  var sink = function (chunk) { acc += chunk; if (onChunk) onChunk(chunk) }
  try {
    if (strategy === "direct") await composeDirect(aiService, sources, prompt, sink, onLog)
    else if (strategy === "mapReduce") await composeMapReduce(aiService, sources, prompt, sink, onLog)
    else await composeHierarchical(aiService, sources, prompt, sink, onLog)
    return { strategy: strategy, tokens: total, text: acc }
  } catch (e) {
    var msg = "\n\n[生成失败: " + e.message + "]"
    sink(msg)
    return { strategy: strategy, tokens: total, text: acc, error: e.message }
  }
}

module.exports = {
  composeReport: composeReport,
  pickStrategy: pickStrategy,
  clusterSources: clusterSources,
  DIRECT_LIMIT: DIRECT_LIMIT,
  MAPREDUCE_LIMIT: MAPREDUCE_LIMIT
}
