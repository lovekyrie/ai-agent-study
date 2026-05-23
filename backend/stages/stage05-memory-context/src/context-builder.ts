import type { ChatMessage } from '@ai-agent-study/llm-client'
import type { LongTermStore, MemoryEntry, ShortTermMemory } from '@ai-agent-study/memory'
import type { BudgetOptions } from './token-budget.js'
import {

  defaultEstimator,
  enforceBudget,
  estimateMessages,
} from './token-budget.js'

export interface BuildContextOptions {
  /** 顶部 system prompt（必填） */
  systemPrompt: string

  /** 短期记忆容器 */
  shortTerm: ShortTermMemory

  /** （可选）历史摘要：来自 `summarizeHistory` 的结果，作为 system 节点注入 */
  summary?: string

  /** （可选）长期记忆 store；若提供 retrievalQuery 才会被使用 */
  longTermStore?: LongTermStore

  /** 长期记忆检索 query；不传则不检索 */
  retrievalQuery?: string

  /** 长期记忆 topK，默认 3 */
  longTermTopK?: number

  /** （可选）token budget 约束；不传则不施加 budget */
  budget?: BudgetOptions
}

export interface BuildContextResult {
  messages: ChatMessage[]
  tokensUsed: number
  /** 因为 budget 被丢弃的短期消息数 */
  trimmedCount: number
  /** 实际检索到的长期记忆条数 */
  retrievedCount: number
}

/** 把 MemoryEntry 转回 ChatMessage（角色直接映射） */
function entryToMessage(entry: MemoryEntry): ChatMessage {
  return {
    role: entry.role,
    content: entry.content,
  }
}

/**
 * 把 system prompt + 摘要 + 长期记忆 + 短期记忆拼装成最终的 ChatMessage[]，
 * 并施加 token budget。
 *
 * 这是 Agent 调用 LLM 前的"最后一步"，也是 stage05 的核心整合点。
 *
 * 顺序约定（从队首到队尾）：
 *   1. 主 system prompt
 *   2. [可选] 摘要 system 节点
 *   3. [可选] 长期记忆 system 节点（标题 + 编号列表）
 *   4. 短期记忆（按时间顺序）
 *
 * 设计取舍：把摘要和长期记忆都用 `role:'system'` 注入，让模型把它们当"背景资料"
 * 而不是"对话历史"。
 */
export async function buildContext(options: BuildContextOptions): Promise<BuildContextResult> {
  const messages: ChatMessage[] = [{ role: 'system', content: options.systemPrompt }]

  // 1) 历史摘要
  if (options.summary && options.summary.trim().length > 0) {
    messages.push({
      role: 'system',
      content: `[历史摘要] ${options.summary}`,
    })
  }

  // 2) 长期记忆检索
  let retrievedCount = 0
  if (options.longTermStore && options.retrievalQuery) {
    const retrieved = await options.longTermStore.search(
      options.retrievalQuery,
      options.longTermTopK ?? 3,
    )
    retrievedCount = retrieved.length
    if (retrieved.length > 0) {
      messages.push({
        role: 'system',
        content:
          `[相关历史片段]\n${
            retrieved.map((e, i) => `${i + 1}. ${e.content}`).join('\n')}`,
      })
    }
  }

  // 3) 短期记忆按时间顺序追加
  for (const entry of options.shortTerm.getAll()) {
    messages.push(entryToMessage(entry))
  }

  // 4) Budget enforcement
  if (options.budget) {
    const result = enforceBudget(messages, options.budget)
    return {
      messages: result.messages,
      tokensUsed: result.tokensUsed,
      trimmedCount: result.trimmedCount,
      retrievedCount,
    }
  }

  return {
    messages,
    tokensUsed: estimateMessages(messages, defaultEstimator),
    trimmedCount: 0,
    retrievedCount,
  }
}
