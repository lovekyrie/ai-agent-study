import type { ChatMessage } from '@ai-agent-study/llm-client'

/**
 * Token estimator 抽象。
 *
 * 这里默认实现是粗略的 `chars/4`（英文/代码场景常用近似值）。
 * 真正生产环境推荐：
 *   - OpenAI 模型 → `tiktoken` 的 `cl100k_base` encoder
 *   - 国内模型 → 各家厂商的 SDK 自带 tokenizer
 *
 * stage11 会在这里接入真实 tokenizer；本阶段重点是 API 形状与裁剪策略，不是估算精度。
 */
export interface TokenEstimator {
  estimate: (text: string) => number
}

/** 默认估算器：chars/4，向上取整。对英文/代码够用。 */
export const defaultEstimator: TokenEstimator = {
  estimate: text => Math.ceil(text.length / 4),
}

/**
 * CJK-aware 估算器：
 * - CJK 字符按 ~1 token/字
 * - ASCII 字符按 ~0.25 token/字
 *
 * 对中文对话比 `chars/4` 更准，但仍是近似。
 */
export const cjkEstimator: TokenEstimator = {
  estimate: (text) => {
    let total = 0
    for (const ch of text) {
      // \u4e00-\u9fff: CJK Unified Ideographs；扩展区不全覆盖但够用
      total += /[\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF]/.test(ch) ? 1 : 0.25
    }
    return Math.ceil(total)
  },
}

/**
 * 估算单条消息的 token 数。
 *
 * OpenAI Chat API 每条消息有约 4 个 "framing token" 开销（role 标签 + 分隔符），
 * 这里统一加 4 作为兜底；具体数字因模型而异（gpt-4o 约 3-4）。
 */
export function estimateMessage(msg: ChatMessage, estimator: TokenEstimator = defaultEstimator): number {
  return 4 + estimator.estimate(msg.content ?? '')
}

/**
 * 估算整个 messages 数组的 token 数（含 3 token 的会话级 priming 开销）。
 */
export function estimateMessages(msgs: ChatMessage[], estimator: TokenEstimator = defaultEstimator): number {
  let total = 3 // priming
  for (const m of msgs) total += estimateMessage(m, estimator)
  return total
}

export interface BudgetOptions {
  /** 整个对话允许的 token 上限（prompt + 留给响应的预算之和） */
  maxTokens: number
  /** 预留给模型生成响应的 token 数（默认 0） */
  reservedForResponse?: number
  /** 是否始终保留首条 system 消息（默认 true） */
  preserveSystem?: boolean
  /** 自定义估算器（默认 defaultEstimator） */
  estimator?: TokenEstimator
}

export interface BudgetResult {
  messages: ChatMessage[]
  tokensUsed: number
  tokensBudget: number
  /** 被丢弃的消息数 */
  trimmedCount: number
}

/**
 * 在 token 预算约束下裁剪 messages。
 *
 * 策略：
 *   1. 始终保留首条 system 消息（如果开启 preserveSystem）
 *   2. 从最新一条消息往前收集，超出预算就停下
 *   3. 至少保留 1 条非 system 消息（避免把所有上下文丢光）
 *
 * 这是"被动兜底"策略；真正的"主动压缩"用 `summarizeHistory`。
 */
export function enforceBudget(messages: ChatMessage[], options: BudgetOptions): BudgetResult {
  const {
    maxTokens,
    reservedForResponse = 0,
    preserveSystem = true,
    estimator = defaultEstimator,
  } = options

  const budget = Math.max(0, maxTokens - reservedForResponse)
  if (messages.length === 0) {
    return { messages: [], tokensUsed: 0, tokensBudget: budget, trimmedCount: 0 }
  }

  const systemHead
    = preserveSystem && messages[0]?.role === 'system' ? [messages[0]] : []
  const rest = messages.slice(systemHead.length)

  // 起手成本 = system + priming
  let used = estimateMessages(systemHead, estimator)
  const kept: ChatMessage[] = []

  // 从最新一条往前走
  for (let i = rest.length - 1; i >= 0; i--) {
    const cost = estimateMessage(rest[i], estimator)
    if (used + cost > budget && kept.length > 0)
      break
    kept.unshift(rest[i])
    used += cost
  }

  const final = [...systemHead, ...kept]
  return {
    messages: final,
    tokensUsed: used,
    tokensBudget: budget,
    trimmedCount: messages.length - final.length,
  }
}
