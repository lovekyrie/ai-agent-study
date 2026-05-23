import type { LLMClient } from '@ai-agent-study/llm-client'
import type { SearchResult } from '@ai-agent-study/vectorstore'
import { createLLMClient } from '@ai-agent-study/llm-client'

export interface RerankResult {
  document: SearchResult['document']
  score: number
  originalScore: number
}

export interface RerankerOptions {
  client?: LLMClient
  /** 单文档展示给 LLM 的最大字符 */
  maxDocChars?: number
}

const RERANK_SYSTEM = `你是一个文档相关性评分器。读取 query 与若干文档，输出每个文档相对 query 的相关性分数（0-1，越高越相关）。
必须返回如下 JSON 对象格式，且 scores 数组顺序与输入文档顺序严格对齐：
{"scores": [0.93, 0.41, ...]}`

export class Reranker {
  private readonly providedClient: LLMClient | undefined
  private cachedClient: LLMClient | undefined
  private readonly maxDocChars: number

  constructor(options: RerankerOptions = {}) {
    this.providedClient = options.client
    this.maxDocChars = options.maxDocChars ?? 500
  }

  private getClient(): LLMClient {
    if (this.providedClient)
      return this.providedClient
    if (!this.cachedClient)
      this.cachedClient = createLLMClient()
    return this.cachedClient
  }

  async rerank(
    query: string,
    results: SearchResult[],
    topK = 5,
  ): Promise<RerankResult[]> {
    if (results.length === 0)
      return []
    if (results.length === 1) {
      return [{ ...results[0], originalScore: results[0].score, score: 1.0 }]
    }

    try {
      const response = await this.getClient().chat(
        [
          { role: 'system', content: RERANK_SYSTEM },
          { role: 'user', content: this.buildRerankPrompt(query, results) },
        ],
        { jsonMode: true, maxTokens: 500, temperature: 0 },
      )

      const scores = Reranker.parseScores(response.content, results.length)
      return results
        .map((r, i) => ({
          ...r,
          originalScore: r.score,
          score: scores[i] ?? r.score,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
    }
    catch (error) {
      // 失败时回退到原始排序（保证 pipeline 健壮）
      console.error('[Reranker] failed, falling back to original ranking:', error)
      return results
        .slice(0, topK)
        .map(r => ({ ...r, originalScore: r.score, score: r.score }))
    }
  }

  private buildRerankPrompt(query: string, results: SearchResult[]): string {
    const docs = results
      .map((r, i) => {
        const content = r.document.content
        const truncated
          = content.length > this.maxDocChars ? `${content.slice(0, this.maxDocChars)}...` : content
        return `[${i}] ${truncated}`
      })
      .join('\n\n')

    return `Query: ${query}

Documents:
${docs}

请返回 JSON 对象：{"scores": [<i=0 的分数>, <i=1 的分数>, ...]}`
  }

  /**
   * 解析 LLM 返回的相关性分数。支持以下格式（按优先级）：
   * 1) {"scores": [0.9, 0.3]}
   * 2) {"0": 0.9, "1": 0.3}
   * 3) 裸数组 [0.9, 0.3]
   * 不合规的项会回填为 NaN，由上层用原 score fallback。
   */
  static parseScores(content: string, expected: number): number[] {
    const empty = new Array<number>(expected).fill(Number.NaN)
    if (!content)
      return empty

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    }
    catch {
      // 退一步：从文本里找第一个 JSON object/array
      const match = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
      if (!match)
        return empty
      try {
        parsed = JSON.parse(match[0])
      }
      catch {
        return empty
      }
    }

    if (Array.isArray(parsed)) {
      return normalizeScoreArray(parsed, expected)
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      if (Array.isArray(obj.scores))
        return normalizeScoreArray(obj.scores, expected)
      // {"0": x, "1": y, ...} 形式
      const indexed: number[] = []
      for (let i = 0; i < expected; i++) {
        const v = obj[String(i)]
        indexed.push(typeof v === 'number' ? v : Number.NaN)
      }
      if (indexed.some(v => Number.isFinite(v)))
        return indexed
    }
    return empty
  }
}

function normalizeScoreArray(raw: unknown[], expected: number): number[] {
  const arr: number[] = new Array(expected).fill(Number.NaN)
  for (let i = 0; i < Math.min(raw.length, expected); i++) {
    const v = raw[i]
    if (typeof v === 'number' && Number.isFinite(v)) {
      arr[i] = Math.min(1, Math.max(0, v))
    }
  }
  return arr
}
