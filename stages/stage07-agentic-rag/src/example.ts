import { Logger } from '@ai-agent-study/logger'
import type { SearchResult } from '@ai-agent-study/vectorstore'
import {
  AgenticRAG,
  HybridSearchEngine,
  MultiKnowledgeRouter,
  type KnowledgeBase,
} from './index.js'

/**
 * Stage 07 端到端 demo。
 *
 * 演示三个独立的 Agentic 模式：
 *   1. AgenticRAG: LLM 规划检索 → 综合答案
 *   2. MultiKnowledgeRouter: LLM 选 primary KB
 *   3. HybridSearchEngine: 纯算法的向量+关键词融合
 *
 * 无 API key 时 LLM 部分会失败并降级为默认计划/路由，pipeline 仍可观察。
 */

function createMockKB(name: string, docs: string[]): KnowledgeBase {
  return {
    name,
    description: `Knowledge base for ${name}`,
    async search(query: string, topK = 5): Promise<SearchResult[]> {
      const lower = query.toLowerCase()
      return docs
        .filter((d) => d.toLowerCase().includes(lower))
        .slice(0, topK)
        .map((content, i) => ({
          id: `${name}-${i}`,
          score: 0.8 + Math.random() * 0.2,
          document: {
            id: `${name}-${i}`,
            content,
            metadata: { source: name, type: 'mock' },
          },
        }))
    },
    async filter(): Promise<SearchResult[]> {
      return []
    },
  }
}

async function main() {
  const logger = new Logger({ name: 'stage07-example', level: 'info' })
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY)
  if (!hasApiKey) {
    logger.warn('No OPENAI_API_KEY set; LLM-driven steps will fall back to default plans.')
  }

  // === 1. AgenticRAG ===
  logger.info('--- 1. AgenticRAG: plan → retrieve → synthesize ---')
  const rag = new AgenticRAG()
  rag.registerKnowledgeBase(
    createMockKB('TypeScript', [
      'TypeScript is a typed superset of JavaScript.',
      'TypeScript supports interfaces and generics.',
      'TypeScript compiles to plain JavaScript.',
    ])
  )
  rag.registerKnowledgeBase(
    createMockKB('Rust', [
      'Rust is a systems programming language.',
      'Rust guarantees memory safety without garbage collection.',
    ])
  )

  const plan = await rag.planRetrieval('How does TypeScript handle types?')
  logger.info('Retrieval plan', {
    kbs: plan.knowledgeBases,
    query: plan.query,
    reasoning: plan.reasoning.slice(0, 80),
  })

  if (hasApiKey) {
    const research = await rag.runResearch('What is TypeScript?')
    logger.info('Research result', {
      answerPreview: research.message.content.slice(0, 100),
      steps: research.steps.length,
      sourcesUsed: research.sources?.length ?? 0,
    })
  }

  // === 2. MultiKnowledgeRouter ===
  logger.info('--- 2. MultiKnowledgeRouter: primary + secondary ---')
  const router = new MultiKnowledgeRouter()
  router.register(createMockKB('docs', ['Documentation content']))
  router.register(createMockKB('wiki', ['Wiki content']))
  router.register(createMockKB('api', ['API reference']))

  const route = await router.route('What is the API for authentication?')
  logger.info('Route', {
    primary: route.primary?.name,
    secondary: route.secondary.map((kb) => kb.name),
  })

  // === 3. HybridSearchEngine ===
  logger.info('--- 3. HybridSearchEngine: vector + keyword fusion ---')
  const vectorKB = createMockKB('vector', ['Vector search content about TypeScript'])
  const keywordKB = createMockKB('keyword', ['Keyword search about TypeScript types'])
  const hybrid = new HybridSearchEngine(vectorKB, keywordKB)

  const hybridResults = await hybrid.search('TypeScript', 5)
  logger.info('Hybrid results', {
    count: hybridResults.length,
    topScores: hybridResults.slice(0, 2).map((r) => ({
      score: r.score.toFixed(3),
      source: r.document.metadata?.source,
    })),
  })

  logger.info('Stage 7 example completed')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
