// Stage 05: Memory & Context Engineering
//
// 占位模块。本阶段的目标是把 `@ai-agent-study/memory` 的核心能力提炼成
// "教学版"实现并补足 token 预算、摘要压缩、Session 容器。
//
// 实施前请先阅读 README.md 的"代码组织（计划）"小节。

export const STAGE05_STATUS = 'skeleton' as const

export {
  ShortTermMemory,
  InMemoryLongTerm,
  type LongTermStore,
  type MemoryEntry,
  type MemoryConfig,
} from '@ai-agent-study/memory'
