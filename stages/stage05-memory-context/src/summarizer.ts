import type { ChatMessage, LLMClient } from '@ai-agent-study/llm-client'

const DEFAULT_SUMMARIZER_PROMPT = `你是一个对话摘要助手。请把下面的对话浓缩成一段简洁的摘要，
要求：
1. 保留所有事实性信息（用户意图、已确认的决定、工具调用与结果、关键参数）
2. 丢弃寒暄、客套话、重复内容
3. 用中文回答，不超过 200 字
4. 如果有"已有摘要"，请基于它累积合并，不要丢失旧信息`

export interface SummarizeOptions {
  /** 保留最近 N 条原始消息不压缩（默认 4） */
  keepRecent?: number
  /** 覆盖默认的摘要 system prompt */
  systemPrompt?: string
  /** 摘要最大 token 数（默认 500） */
  maxTokens?: number
  /** 已有摘要（用于增量摘要） */
  previousSummary?: string
}

export interface SummarizeResult {
  /** 摘要正文（不含 "[历史摘要] " 前缀） */
  summary: string
  /** 被压缩的原始消息数 */
  summarizedCount: number
  /** 保留下来的原始消息数 */
  keptCount: number
  /** 压缩后的完整 messages（systemHead + 摘要 + 最近原文） */
  messages: ChatMessage[]
}

const SUMMARY_PREFIX = '[历史摘要] '

/**
 * 用 LLM 把 messages 中早期对话压缩为单条摘要 system 消息。
 *
 * 输入: [system?, m1, m2, ..., m20]   keepRecent=3
 * 输出: [system?, summary(role:'system'), m18, m19, m20]
 *
 * 边界：
 *   - messages 中"非 system"部分 ≤ keepRecent → 原样返回
 *   - 没有 system head 时摘要仍然以 role:'system' 形式插入到队首
 *   - LLM 失败时**抛错**（让上层决定降级策略：可能是直接截断兜底）
 */
export async function summarizeHistory(
  messages: ChatMessage[],
  client: LLMClient,
  options: SummarizeOptions = {},
): Promise<SummarizeResult> {
  const {
    keepRecent = 4,
    systemPrompt = DEFAULT_SUMMARIZER_PROMPT,
    maxTokens = 500,
    previousSummary,
  } = options

  if (messages.length === 0) {
    return { summary: '', summarizedCount: 0, keptCount: 0, messages: [] }
  }

  const systemHead = messages[0]?.role === 'system' ? [messages[0]] : []
  const rest = messages.slice(systemHead.length)

  if (rest.length <= keepRecent) {
    // 不够压缩，原样返回
    return {
      summary: previousSummary ?? '',
      summarizedCount: 0,
      keptCount: rest.length,
      messages,
    }
  }

  const toSummarize = rest.slice(0, rest.length - keepRecent)
  const recent = rest.slice(rest.length - keepRecent)

  const corpus = toSummarize
    .map(m => `[${m.role}] ${m.content}`)
    .join('\n')

  const userContent = previousSummary
    ? `[已有摘要]\n${previousSummary}\n\n[新对话]\n${corpus}`
    : `请总结以下对话：\n${corpus}`

  const response = await client.chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    { maxTokens },
  )

  const summary = response.content.trim()

  const summaryMessage: ChatMessage = {
    role: 'system',
    content: SUMMARY_PREFIX + summary,
  }

  return {
    summary,
    summarizedCount: toSummarize.length,
    keptCount: recent.length,
    messages: [...systemHead, summaryMessage, ...recent],
  }
}

/** 判断一条 message 是否是摘要节点（约定前缀） */
export function isSummaryMessage(msg: ChatMessage): boolean {
  return msg.role === 'system' && msg.content.startsWith(SUMMARY_PREFIX)
}
