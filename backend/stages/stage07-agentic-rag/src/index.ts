// Stage 07: Agentic RAG
//
// 三个独立可用的"Agentic"模式：
//   - AgenticRAG: 规划 → 检索 → 综合（LLM 做决策、执行是确定性的）
//   - MultiKnowledgeRouter: 多 KB 路由（LLM 选 primary + secondary）
//   - HybridSearchEngine: 向量 + 关键词融合搜索（无 LLM 参与，纯算法）

export { AgenticRAG, type AgenticRAGOptions } from './agentic-rag.js'
export {
  HybridSearchEngine,
  type HybridSearchOptions,
} from './hybrid-search.js'
export { MultiKnowledgeRouter, type RouteResult, type RouterOptions } from './router.js'
export type { KnowledgeBase, ResearchResponse, RetrievalPlan } from './types.js'
