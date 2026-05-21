import { createLLMClient, type LLMClient } from '@ai-agent-study/llm-client'
import type { KnowledgeBase } from './types.js'

export interface RouterOptions {
  llmClient?: LLMClient
}

export interface RouteResult {
  primary: KnowledgeBase | null
  secondary: KnowledgeBase[]
}

/**
 * 多知识库路由器：让 LLM 选出"主 KB + 辅助 KB"。
 *
 * 与 AgenticRAG 的区别：
 *   - AgenticRAG: 一次规划要查多个 KB，可能并行
 *   - Router: 明确选出 1 个 primary + N 个 secondary，调用方按需取舍
 *
 * 适用：query 类型差异较大时（API 文档 vs Wiki vs 代码库），用 primary 做"主答"，secondary 做"补充"。
 */
export class MultiKnowledgeRouter {
  private readonly knowledgeBases = new Map<string, KnowledgeBase>()
  private cachedClient?: LLMClient

  constructor(options: RouterOptions = {}) {
    this.cachedClient = options.llmClient
  }

  private getClient(): LLMClient {
    if (!this.cachedClient) this.cachedClient = createLLMClient()
    return this.cachedClient
  }

  register(kb: KnowledgeBase): void {
    this.knowledgeBases.set(kb.name, kb)
  }

  async route(query: string): Promise<RouteResult> {
    const kbs = Array.from(this.knowledgeBases.values())
    if (kbs.length === 0) return { primary: null, secondary: [] }
    if (kbs.length === 1) return { primary: kbs[0], secondary: [] }

    const prompt = `Route this query to the best knowledge base(s):

Query: ${query}

Knowledge Bases:
${kbs.map((kb) => `- ${kb.name}: ${kb.description}`).join('\n')}

Respond with JSON:
{
  "primary": "kb_name or null",
  "secondary": ["kb1", "kb2"]
}`

    try {
      const response = await this.getClient().chat(
        [
          { role: 'system', content: 'You are a knowledge base routing assistant.' },
          { role: 'user', content: prompt },
        ],
        { jsonMode: true }
      )

      const result = JSON.parse(response.content) as {
        primary?: unknown
        secondary?: unknown
      }
      const secondaryKbs: KnowledgeBase[] = []
      const secondary = Array.isArray(result.secondary) ? result.secondary : []
      for (const name of secondary) {
        if (typeof name !== 'string') continue
        const kb = this.knowledgeBases.get(name)
        if (kb) secondaryKbs.push(kb)
      }
      return {
        primary:
          typeof result.primary === 'string'
            ? (this.knowledgeBases.get(result.primary) ?? null)
            : null,
        secondary: secondaryKbs,
      }
    } catch {
      // LLM 失败兜底：取第一个作为 primary，其余作为 secondary
      return { primary: kbs[0], secondary: kbs.slice(1) }
    }
  }
}
