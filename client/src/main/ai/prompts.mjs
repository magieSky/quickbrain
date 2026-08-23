export const SYSTEM_PROMPT = '你是一个专业的信息整理助手。请将用户输入的内容按照要求格式进行整理。输出应该清晰、结构化，便于阅读和检索。只输出整理后的内容，不要添加额外的解释。'

export const STYLE_PROMPTS = {
  summary: (content) => `请将以下内容整理成简洁的摘要，保留关键信息：\n\n${content}`,
  structured: (content) => `请将以下内容整理成结构化格式，包括：标题、要点、详细说明：\n\n${content}`,
  tags: (content) => `请分析以下内容，提取关键标签并重新组织成带标签的结构化笔记：\n\n${content}`,
  mindmap: (content) => `请将以下内容整理成思维导图形式，使用层级结构展示：\n\n${content}`
}

export const CATEGORIZE_PROMPT = `分析这段内容的主题，返回JSON：{"category":"类别","tags":["标签"]}。类别只能是：工作、学习、生活、灵感、其他。标签最多3个，用逗号分隔。`

export function buildFormatPrompt(content, style = 'summary') {
  const builder = STYLE_PROMPTS[style] || STYLE_PROMPTS.summary
  return builder(content)
}

export function buildSemanticSearchPrompt(query, noteSummaries) {
  const list = noteSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')
  return `用户的查询是："${query}"\n\n以下是从本地笔记库中检索到的候选笔记（按相关度排序）：\n` + `${list}` + `\n\n请分析用户的真实意图，返回最相关的笔记编号列表。\n\n返回JSON格式：{"matchedIds":[编号数组，从1开始],"reasoning":"选择理由"}`
}