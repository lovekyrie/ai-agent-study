// Stage 05: Memory & Context Engineering
//
// 这个 stage 把 `@ai-agent-study/memory` 的两个原语（短期 / 长期）
// 升级为 Agent 可以真正用起来的"上下文管线"：
//   - token-budget: 估算 + 兜底裁剪
//   - summarizer: 用 LLM 把旧对话压缩成摘要
//   - context-builder: 把所有上下文源拼成最终的 ChatMessage[]
//   - session: 高层容器，串起以上所有能力

// —— 重新导出 packages/memory 的原语 ——
export {
  ShortTermMemory,
  InMemoryLongTerm,
  type LongTermStore,
  type MemoryEntry,
  type MemoryConfig,
} from '@ai-agent-study/memory'

// —— Token 预算与估算 ——
export {
  defaultEstimator,
  cjkEstimator,
  estimateMessage,
  estimateMessages,
  enforceBudget,
  type TokenEstimator,
  type BudgetOptions,
  type BudgetResult,
} from './token-budget.js'

// —— LLM 摘要压缩 ——
export {
  summarizeHistory,
  isSummaryMessage,
  type SummarizeOptions,
  type SummarizeResult,
} from './summarizer.js'

// —— 上下文拼装 ——
export {
  buildContext,
  type BuildContextOptions,
  type BuildContextResult,
} from './context-builder.js'

// —— Session 容器 ——
export {
  Session,
  type SessionConfig,
  type CompressResult,
  type GetMessagesOptions,
} from './session.js'
