import type { ChatMessage, LLMClient } from '@ai-agent-study/llm-client'
import type { LongTermStore, MemoryEntry } from '@ai-agent-study/memory'
import type { BuildContextResult } from './context-builder.js'
import type { SummarizeOptions } from './summarizer.js'
import type { BudgetOptions } from './token-budget.js'
import { randomUUID } from 'node:crypto'
import {
  InMemoryLongTerm,

  ShortTermMemory,
} from '@ai-agent-study/memory'
import { buildContext } from './context-builder.js'
import { summarizeHistory } from './summarizer.js'

export interface SessionConfig {
  /** 会话 ID；不传则自动生成 */
  id?: string
  /** 顶部 system prompt */
  systemPrompt: string
  /** 短期记忆容量上限（默认 50） */
  maxShortTerm?: number
  /** （可选）长期记忆 store；不传则不启用长期记忆 */
  longTermStore?: LongTermStore
  /** （可选）LLM 客户端；只有调用 `compress()` 时才需要 */
  llmClient?: LLMClient
  /** 业务自定义元信息 */
  metadata?: Record<string, unknown>
}

export interface CompressResult {
  /** 本次产生的最新摘要（含累积） */
  summary: string
  /** 被压缩的原始消息数 */
  summarizedCount: number
  /** 保留的原始消息数 */
  keptCount: number
}

export interface GetMessagesOptions {
  /** 长期记忆检索 query */
  retrievalQuery?: string
  /** 长期记忆 topK，默认 3 */
  longTermTopK?: number
  /** Token budget；不传则不施加 */
  budget?: BudgetOptions
}

/**
 * Session = 一次完整任务的上下文容器。
 *
 * 主要职责：
 *   1. 管理短期记忆（当前会话内的所有 turn）
 *   2. 委托给可选的长期记忆 store（跨会话的事实积累）
 *   3. 维护一份"累积摘要"，避免长对话不断膨胀
 *   4. 统一 `getMessagesForLLM()` 入口，把 system + 摘要 + 长期 + 短期 + budget 一次性整合
 *
 * 真实的持久化（Postgres/Redis）放在 stage11 实现；本类只在内存里管理。
 */
export class Session {
  readonly id: string
  readonly systemPrompt: string
  readonly metadata: Record<string, unknown>
  readonly shortTerm: ShortTermMemory
  readonly longTermStore: LongTermStore | undefined
  private summary = ''
  private readonly llmClient: LLMClient | undefined

  constructor(config: SessionConfig) {
    this.id = config.id ?? `sess_${randomUUID()}`
    this.systemPrompt = config.systemPrompt
    this.metadata = { ...(config.metadata ?? {}) }
    this.shortTerm = new ShortTermMemory(config.maxShortTerm ?? 50)
    this.longTermStore = config.longTermStore
    this.llmClient = config.llmClient
  }

  /** 工厂：快速创建一个带 in-memory 长期记忆的 session（用于 demo / 测试） */
  static withInMemoryLongTerm(
    config: Omit<SessionConfig, 'longTermStore'>,
  ): Session {
    return new Session({ ...config, longTermStore: new InMemoryLongTerm() })
  }

  addUserMessage(content: string, metadata?: Record<string, unknown>): MemoryEntry {
    return this.shortTerm.add(content, 'user', metadata)
  }

  addAssistantMessage(content: string, metadata?: Record<string, unknown>): MemoryEntry {
    return this.shortTerm.add(content, 'assistant', metadata)
  }

  addToolMessage(content: string, metadata?: Record<string, unknown>): MemoryEntry {
    return this.shortTerm.add(content, 'tool', metadata)
  }

  /** 把短期记忆里的某一条"提升"到长期记忆（如果配置了 long-term store） */
  async promoteToLongTerm(entryId: string): Promise<boolean> {
    const entry = this.shortTerm.get(entryId)
    if (!entry || !this.longTermStore)
      return false
    await this.longTermStore.add(entry)
    return true
  }

  /** 获取当前的累积摘要（首次 `compress` 前是空字符串） */
  getSummary(): string {
    return this.summary
  }

  /**
   * 构造 LLM 调用前最终的 messages，自动整合：
   * - system prompt
   * - 累积摘要（如果有）
   * - 长期记忆检索结果（如果给了 retrievalQuery）
   * - 短期记忆
   * - token budget 约束
   */
  async getMessagesForLLM(opts: GetMessagesOptions = {}): Promise<BuildContextResult> {
    return buildContext({
      systemPrompt: this.systemPrompt,
      shortTerm: this.shortTerm,
      summary: this.summary || undefined,
      longTermStore: this.longTermStore,
      retrievalQuery: opts.retrievalQuery,
      longTermTopK: opts.longTermTopK,
      budget: opts.budget,
    })
  }

  /**
   * 主动压缩短期记忆：
   *   1. 用 LLM 把"早期对话"摘要成单段
   *   2. 累积到 `this.summary`（带前一次摘要做增量摘要，避免信息丢失）
   *   3. 清空短期记忆，只保留最近 `keepRecent` 条
   *
   * 返回 null 当：
   *   - 没有配置 llmClient
   *   - 短期记忆条数 ≤ keepRecent（不值得压缩）
   *
   * 失败行为：summarizeHistory 抛错会向上传递，由调用方决定是否降级。
   */
  async compress(options: SummarizeOptions = {}): Promise<CompressResult | null> {
    if (!this.llmClient)
      return null

    const keepRecent = options.keepRecent ?? 4
    const all = this.shortTerm.getAll()
    if (all.length <= keepRecent)
      return null

    // 把 short-term 内容拼成 messages 给 summarizer
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...all.map((entry): ChatMessage => ({ role: entry.role, content: entry.content })),
    ]

    const result = await summarizeHistory(messages, this.llmClient, {
      ...options,
      keepRecent,
      previousSummary: this.summary || undefined,
    })

    // 更新累积摘要
    this.summary = result.summary

    // 重建 short-term：只保留最近 keepRecent 条
    const keep = all.slice(-keepRecent)
    this.shortTerm.clear()
    for (const entry of keep) {
      this.shortTerm.add(entry.content, entry.role, entry.metadata)
    }

    return {
      summary: result.summary,
      summarizedCount: result.summarizedCount,
      keptCount: keep.length,
    }
  }

  /** 重置 session（保留 systemPrompt，清空 short-term + summary） */
  reset(): void {
    this.shortTerm.clear()
    this.summary = ''
  }
}
