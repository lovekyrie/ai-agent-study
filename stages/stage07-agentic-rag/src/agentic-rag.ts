import { createLLMClient, type LLMClient } from '@ai-agent-study/llm-client'
import type { SearchResult } from '@ai-agent-study/vectorstore'
import type { KnowledgeBase, ResearchResponse, RetrievalPlan } from './types.js'

export interface AgenticRAGOptions {
  /** 不传则惰性 createLLMClient() */
  llmClient?: LLMClient
  /** 限制 LLM 规划的 topK 上限（防止"幻觉出 topK=1000"） */
  maxTopK?: number
}

/**
 * AgenticRAG：结构化"规划 → 检索 → 综合"三步走的 RAG。
 *
 * 这不是 ReAct loop（那是 stage04 Agent 的工作 + stage07 的 `ToolBasedRAG`）；
 * 这里展示的是另一种范式：**LLM 用来做"决策"，但执行还是确定性的**。
 *
 * 适用场景：
 *   - 知道"需要检索"，不确定"在哪检索"
 *   - 检索结果需要 LLM 综合而不是用户自己读
 *   - 不需要多轮迭代（一次规划 + 一次综合就够）
 */
export class AgenticRAG {
  private readonly knowledgeBases = new Map<string, KnowledgeBase>()
  private cachedClient?: LLMClient
  private readonly maxTopK: number

  constructor(options: AgenticRAGOptions = {}) {
    this.cachedClient = options.llmClient
    this.maxTopK = options.maxTopK ?? 20
  }

  private getClient(): LLMClient {
    if (!this.cachedClient) this.cachedClient = createLLMClient()
    return this.cachedClient
  }

  registerKnowledgeBase(kb: KnowledgeBase): void {
    this.knowledgeBases.set(kb.name, kb)
  }

  /** 给定 query，让 LLM 决定要查哪些 KB / 用什么 query / topK 多少。 */
  async planRetrieval(query: string): Promise<RetrievalPlan> {
    const kbList = Array.from(this.knowledgeBases.values())
    if (kbList.length === 0) {
      return {
        knowledgeBases: [],
        query,
        topK: 0,
        useHybrid: false,
        reasoning: 'No knowledge bases registered',
      }
    }

    const systemPrompt = `You are a retrieval planning assistant. Given a user query and available knowledge bases, decide:
1. Which knowledge bases to search
2. Whether to use hybrid search (vector + keyword)
3. How many results to retrieve

Knowledge Bases:
${kbList.map((kb) => `- ${kb.name}: ${kb.description}`).join('\n')}

Respond with JSON:
{
  "knowledgeBases": ["kb1", "kb2"],
  "query": "optimized query",
  "topK": 10,
  "useHybrid": true,
  "reasoning": "why you chose this approach"
}`

    try {
      const response = await this.getClient().chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        { jsonMode: true }
      )

      return this.normalizePlan(
        JSON.parse(response.content),
        query,
        kbList.map((kb) => kb.name)
      )
    } catch {
      // LLM 失败时降级为"全部 KB / 默认 topK"
      return {
        knowledgeBases: kbList.map((kb) => kb.name),
        query,
        topK: 10,
        useHybrid: true,
        reasoning: 'Default plan due to planning failure',
      }
    }
  }

  /** 跑完"规划 → 检索"两步，返回去重排序后的结果。 */
  async retrieve(query: string): Promise<SearchResult[]> {
    const plan = await this.planRetrieval(query)
    return this.retrieveWithPlan(plan)
  }

  /** 暴露给外部按已有 plan 执行检索（便于演示和测试） */
  async retrieveWithPlan(plan: RetrievalPlan): Promise<SearchResult[]> {
    const results: SearchResult[] = []

    for (const kbName of plan.knowledgeBases) {
      const kb = this.knowledgeBases.get(kbName)
      if (!kb) continue
      const kbResults = await kb.search(plan.query, plan.topK)
      results.push(...kbResults)
    }

    // 跨 KB 去重 + 按 score 取 topK
    const seen = new Set<string>()
    const deduped = results.filter((r) => {
      if (seen.has(r.document.id)) return false
      seen.add(r.document.id)
      return true
    })

    return deduped.sort((a, b) => b.score - a.score).slice(0, plan.topK)
  }

  /** 端到端的 research：规划 → 检索 → LLM 综合并附引用。 */
  async runResearch(query: string): Promise<ResearchResponse> {
    const steps: { action: string; observation: string }[] = []
    const plan = await this.planRetrieval(query)
    steps.push({
      action: 'plan_retrieval',
      observation: `${plan.reasoning}; query="${plan.query}"; kbs=${plan.knowledgeBases.join(', ') || 'none'}; topK=${plan.topK}`,
    })

    const sources = await this.retrieveWithPlan(plan)
    steps.push({
      action: 'retrieve',
      observation: `Retrieved ${sources.length} source chunks from ${plan.knowledgeBases.length} knowledge base(s).`,
    })

    if (sources.length === 0) {
      return {
        message: {
          role: 'assistant',
          content: `No relevant sources were found for: ${query}`,
        },
        steps,
        sources,
        plan,
      }
    }

    const context = sources
      .map((result, index) => {
        const source = result.document.metadata?.source ?? result.document.id
        return `[${index + 1}] source=${source} score=${result.score.toFixed(4)}
${result.document.content}`
      })
      .join('\n\n')

    const response = await this.getClient().chat(
      [
        {
          role: 'system',
          content: `You are a research assistant. Answer only from the provided retrieved sources.
If the sources are insufficient, say what is missing. Cite sources with [1], [2] notation.`,
        },
        {
          role: 'user',
          content: `Question: ${query}

Available knowledge bases:
${Array.from(this.knowledgeBases.values())
  .map((kb) => `- ${kb.name}: ${kb.description}`)
  .join('\n')}

Retrieved sources:
${context}`,
        },
      ],
      { temperature: 0.2, maxTokens: 1200 }
    )

    steps.push({
      action: 'synthesize',
      observation: `Generated answer grounded in ${sources.length} retrieved source chunk(s).`,
    })

    return {
      message: { role: 'assistant', content: response.content },
      steps,
      sources,
      plan,
    }
  }

  private normalizePlan(
    raw: unknown,
    originalQuery: string,
    validKbNames: string[]
  ): RetrievalPlan {
    const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
    const requestedKbs = Array.isArray(obj.knowledgeBases)
      ? obj.knowledgeBases.filter((name): name is string => typeof name === 'string')
      : []
    const validSet = new Set(validKbNames)
    const selected = requestedKbs.filter((name) => validSet.has(name))
    const topK =
      typeof obj.topK === 'number' && Number.isFinite(obj.topK)
        ? Math.max(1, Math.min(this.maxTopK, Math.floor(obj.topK)))
        : 10

    return {
      knowledgeBases: selected.length > 0 ? selected : validKbNames,
      query:
        typeof obj.query === 'string' && obj.query.trim() ? obj.query.trim() : originalQuery,
      topK,
      useHybrid: typeof obj.useHybrid === 'boolean' ? obj.useHybrid : true,
      reasoning:
        typeof obj.reasoning === 'string' ? obj.reasoning : 'Validated default retrieval plan',
    }
  }
}
