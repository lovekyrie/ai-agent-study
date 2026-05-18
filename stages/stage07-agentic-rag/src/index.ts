import { createLLMClient } from '@ai-agent-study/llm-client'
import type { SearchResult } from '@ai-agent-study/vectorstore'

export interface KnowledgeBase {
  name: string
  description: string
  search(query: string, topK?: number): Promise<SearchResult[]>
  filter(metadata: Record<string, string | number | boolean>): Promise<SearchResult[]>
}

export interface RetrievalPlan {
  knowledgeBases: string[]
  query: string
  topK: number
  useHybrid: boolean
  reasoning: string
}

export interface AgentResponse {
  message: { role: string; content: string }
  steps: { action: string; observation: string }[]
  sources?: SearchResult[]
  plan?: RetrievalPlan
}

// Simple Agent implementation for stage6
class Agent {
  private name: string
  private description: string
  private client = createLLMClient()
  private maxIterations: number = 5

  constructor(options: { name: string; description: string }) {
    this.name = options.name
    this.description = options.description
  }

  async run(task: string): Promise<AgentResponse> {
    const steps: { action: string; observation: string }[] = []
    let context = ''
    let currentTask = task

    for (let i = 0; i < this.maxIterations; i++) {
      const response = await this.client.chat([
        {
          role: 'system',
          content: `You are ${this.name}. ${this.description}

Current task: ${currentTask}
Context from previous steps: ${context || 'None'}

Respond with JSON:
{
  "action": "what you are doing now",
  "thinking": "your reasoning",
  "observation": "what you learned or decided"
}`
        }
      ], { jsonMode: true })

      try {
        const parsed = JSON.parse(response.content)
        steps.push({ action: parsed.action || '', observation: parsed.observation || '' })
        context += `\n${parsed.observation || ''}`

        if (parsed.action?.toLowerCase().includes('done') ||
            parsed.action?.toLowerCase().includes('complete') ||
            parsed.action?.toLowerCase().includes('finish')) {
          break
        }
      } catch {
        // If JSON parsing fails, just return the content
        steps.push({ action: 'completed', observation: response.content })
        break
      }
    }

    return {
      message: { role: 'assistant', content: context },
      steps,
    }
  }
}

export class AgenticRAG {
  private agent: Agent
  private knowledgeBases: Map<string, KnowledgeBase> = new Map()
  private client = createLLMClient()
  private maxTopK = 20

  constructor() {
    this.agent = new Agent({
      name: 'research-assistant',
      description: 'Research assistant that can search multiple knowledge bases',
    })
  }

  registerKnowledgeBase(kb: KnowledgeBase): void {
    this.knowledgeBases.set(kb.name, kb)
  }

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
${kbList.map(kb => `- ${kb.name}: ${kb.description}`).join('\n')}

Respond with JSON:
{
  "knowledgeBases": ["kb1", "kb2"],
  "query": "optimized query",
  "topK": 10,
  "useHybrid": true,
  "reasoning": "why you chose this approach"
}`

    try {
      const response = await this.client.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ], { jsonMode: true })

      return this.normalizePlan(JSON.parse(response.content), query, kbList.map(kb => kb.name))
    } catch (error) {
      return {
        knowledgeBases: kbList.map(kb => kb.name),
        query,
        topK: 10,
        useHybrid: true,
        reasoning: 'Default plan due to planning failure',
      }
    }
  }

  async retrieve(query: string): Promise<SearchResult[]> {
    const plan = await this.planRetrieval(query)
    return this.retrieveWithPlan(plan)
  }

  private async retrieveWithPlan(plan: RetrievalPlan): Promise<SearchResult[]> {
    const results: SearchResult[] = []

    for (const kbName of plan.knowledgeBases) {
      const kb = this.knowledgeBases.get(kbName)
      if (kb) {
        const kbResults = await kb.search(plan.query, plan.topK)
        results.push(...kbResults)
      }
    }

    const seen = new Set<string>()
    const deduped = results.filter(r => {
      if (seen.has(r.document.id)) return false
      seen.add(r.document.id)
      return true
    })

    return deduped.sort((a, b) => b.score - a.score).slice(0, plan.topK)
  }

  async runResearch(query: string): Promise<AgentResponse> {
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

    const context = sources.map((result, index) => {
      const source = result.document.metadata?.source ?? result.document.id
      return `[${index + 1}] source=${source} score=${result.score.toFixed(4)}
${result.document.content}`
    }).join('\n\n')

    const response = await this.client.chat([
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
  .map(kb => `- ${kb.name}: ${kb.description}`)
  .join('\n')}

Retrieved sources:
${context}`,
      },
    ], { temperature: 0.2, maxTokens: 1200 })

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

  private normalizePlan(raw: unknown, originalQuery: string, validKbNames: string[]): RetrievalPlan {
    const obj = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {}
    const requestedKbs = Array.isArray(obj.knowledgeBases)
      ? obj.knowledgeBases.filter((name): name is string => typeof name === 'string')
      : []
    const validSet = new Set(validKbNames)
    const selected = requestedKbs.filter(name => validSet.has(name))
    const topK = typeof obj.topK === 'number' && Number.isFinite(obj.topK)
      ? Math.max(1, Math.min(this.maxTopK, Math.floor(obj.topK)))
      : 10

    return {
      knowledgeBases: selected.length > 0 ? selected : validKbNames,
      query: typeof obj.query === 'string' && obj.query.trim() ? obj.query.trim() : originalQuery,
      topK,
      useHybrid: typeof obj.useHybrid === 'boolean' ? obj.useHybrid : true,
      reasoning: typeof obj.reasoning === 'string' ? obj.reasoning : 'Validated default retrieval plan',
    }
  }
}

export class MultiKnowledgeRouter {
  private knowledgeBases: Map<string, KnowledgeBase> = new Map()
  private client = createLLMClient()

  register(kb: KnowledgeBase): void {
    this.knowledgeBases.set(kb.name, kb)
  }

  async route(query: string): Promise<{
    primary: KnowledgeBase | null
    secondary: KnowledgeBase[]
  }> {
    const kbs = Array.from(this.knowledgeBases.values())
    if (kbs.length === 0) return { primary: null, secondary: [] }
    if (kbs.length === 1) return { primary: kbs[0], secondary: [] }

    const prompt = `Route this query to the best knowledge base(s):

Query: ${query}

Knowledge Bases:
${kbs.map(kb => `- ${kb.name}: ${kb.description}`).join('\n')}

Respond with JSON:
{
  "primary": "kb_name or null",
  "secondary": ["kb1", "kb2"]
}`

    try {
      const response = await this.client.chat([
        { role: 'system', content: 'You are a knowledge base routing assistant.' },
        { role: 'user', content: prompt }
      ], { jsonMode: true })

      const result = JSON.parse(response.content) as { primary?: unknown; secondary?: unknown }
      const secondaryKbs: KnowledgeBase[] = []
      const secondary = Array.isArray(result.secondary) ? result.secondary : []
      for (const name of secondary) {
        if (typeof name !== 'string') continue
        const kb = this.knowledgeBases.get(name)
        if (kb) secondaryKbs.push(kb)
      }
      return {
        primary: typeof result.primary === 'string' ? this.knowledgeBases.get(result.primary) ?? null : null,
        secondary: secondaryKbs,
      }
    } catch {
      return { primary: kbs[0], secondary: kbs.slice(1) }
    }
  }
}

export class HybridSearchEngine {
  private vectorKB: KnowledgeBase
  private keywordKB: KnowledgeBase

  constructor(vectorKB: KnowledgeBase, keywordKB: KnowledgeBase) {
    this.vectorKB = vectorKB
    this.keywordKB = keywordKB
  }

  async search(query: string, topK: number = 10): Promise<SearchResult[]> {
    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorKB.search(query, topK * 2),
      this.keywordKB.search(query, topK * 2),
    ])

    const normalizedVector = normalizeScores(vectorResults)
    const normalizedKeyword = normalizeScores(keywordResults)
    const scoreMap = new Map<string, { result: SearchResult; score: number }>()

    for (const r of normalizedVector) {
      scoreMap.set(r.result.document.id, { result: r.result, score: r.score * 0.7 })
    }

    for (const r of normalizedKeyword) {
      const existing = scoreMap.get(r.result.document.id)
      if (existing) {
        existing.score += r.score * 0.3
      } else {
        scoreMap.set(r.result.document.id, { result: r.result, score: r.score * 0.3 })
      }
    }

    const combined = Array.from(scoreMap.values())
      .map(({ result, score }) => ({
        ...result,
        score,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)

    return combined
  }
}

function normalizeScores(results: SearchResult[]): { result: SearchResult; score: number }[] {
  if (results.length === 0) return []
  const scores = results.map(r => r.score)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  if (max === min) {
    return results.map(result => ({ result, score: 1 }))
  }
  return results.map(result => ({
    result,
    score: (result.score - min) / (max - min),
  }))
}
