import type { SearchResult } from '@ai-agent-study/vectorstore'

/**
 * 抽象的知识库接口。
 *
 * Stage07 把"知识库"作为一等公民：
 *   - `search` 是任何 KB 都必须实现的（向量 / SQL / 关键字都可以）
 *   - `filter` 用于带元数据过滤（按 source、author、date 等）
 *
 * stage06 的 `AdvancedRAG` 是一个具体实现；stage07 演示如何让 Agent 在多个 KB 之间路由。
 */
export interface KnowledgeBase {
  name: string
  description: string
  search: (query: string, topK?: number) => Promise<SearchResult[]>
  filter: (metadata: Record<string, string | number | boolean>) => Promise<SearchResult[]>
}

/** LLM 规划出来的检索计划。 */
export interface RetrievalPlan {
  knowledgeBases: string[]
  query: string
  topK: number
  useHybrid: boolean
  reasoning: string
}

/** stage07 自己的"研究 agent 响应"结构（与 stage04 Agent 的 AgentResponse 不同：这里强调 sources）。 */
export interface ResearchResponse {
  message: { role: 'assistant', content: string }
  steps: { action: string, observation: string }[]
  sources?: SearchResult[]
  plan?: RetrievalPlan
}
