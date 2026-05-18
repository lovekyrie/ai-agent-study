import { createLLMClient, type LLMClient } from '@ai-agent-study/llm-client'

export interface QueryRewriteResult {
  original: string
  rewritten: string[]
}

export interface QueryRewriterOptions {
  client?: LLMClient
}

const REWRITE_SYSTEM = `你是查询改写专家。读取用户的原始问题，输出多个语义等价但表述不同的检索查询，覆盖不同侧面与同义词，以提高向量检索召回率。
必须严格返回如下 JSON 对象格式（不要其他内容）：
{"queries": ["...", "...", "..."]}`

const COMPRESS_SYSTEM = `你是文本压缩助手。请把用户提供的内容压缩到指定字符数以内，保留关键信息，去除冗余，用中文输出。`

export class QueryRewriter {
  private readonly providedClient: LLMClient | undefined
  private cachedClient: LLMClient | undefined

  constructor(options: QueryRewriterOptions = {}) {
    this.providedClient = options.client
  }

  private getClient(): LLMClient {
    if (this.providedClient) return this.providedClient
    if (!this.cachedClient) this.cachedClient = createLLMClient()
    return this.cachedClient
  }

  async rewrite(query: string, numVariations = 3): Promise<QueryRewriteResult> {
    try {
      const response = await this.getClient().chat(
        [
          { role: 'system', content: REWRITE_SYSTEM },
          {
            role: 'user',
            content: `原始问题：${query}\n请输出 ${numVariations} 个不同角度的检索查询。`,
          },
        ],
        { jsonMode: true, maxTokens: 400, temperature: 0.4 }
      )

      const variations = QueryRewriter.parseVariations(response.content, numVariations)
      // 至少返回原 query，避免空数组让上游失去检索能力
      if (variations.length === 0) return { original: query, rewritten: [query] }
      return { original: query, rewritten: variations }
    } catch (error) {
      console.error('[QueryRewriter] failed, falling back to original query:', error)
      return { original: query, rewritten: [query] }
    }
  }

  async expand(query: string, numVariations = 3): Promise<string[]> {
    const result = await this.rewrite(query, numVariations)
    // 把原查询也带上，保证不会比单查询更差
    return Array.from(new Set([query, ...result.rewritten]))
  }

  async compress(context: string[], maxLength = 2000): Promise<string> {
    const combined = context.join('\n\n')
    if (combined.length <= maxLength) return combined

    try {
      const response = await this.getClient().chat(
        [
          { role: 'system', content: COMPRESS_SYSTEM },
          { role: 'user', content: `请压缩至 ${maxLength} 字以内：\n\n${combined}` },
        ],
        { maxTokens: 1000, temperature: 0 }
      )
      return response.content || combined.slice(0, maxLength) + '...'
    } catch {
      return combined.slice(0, maxLength) + '...'
    }
  }

  /**
   * 解析 LLM 返回的 query 列表。支持：
   * 1) {"queries": ["...", "..."]}
   * 2) 裸数组 ["...", "..."]
   * 3) 编号列表 fallback（每行一个）
   */
  static parseVariations(content: string, max: number): string[] {
    if (!content) return []
    const trimmed = content.trim()

    // 优先尝试 JSON
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return cleanStrings(parsed).slice(0, max)
      }
      if (parsed && typeof parsed === 'object') {
        const arr = (parsed as Record<string, unknown>).queries
        if (Array.isArray(arr)) return cleanStrings(arr).slice(0, max)
      }
    } catch {
      // 不是 JSON，走 fallback
    }

    // Fallback：按行解析编号列表
    const lines = trimmed.split('\n')
    const out: string[] = []
    for (const raw of lines) {
      const line = raw.trim()
      if (!line) continue
      // 移除前缀编号（1. / 1) / 1: / - / • / * 等）
      const stripped = line.replace(/^(?:[-•*]|\d+[.):、])\s*/, '').trim()
      // 移除可能的引号包裹
      const unquoted = stripped.replace(/^["'「『]|["'」』]$/g, '').trim()
      if (unquoted.length >= 2 && unquoted.length <= 200) {
        out.push(unquoted)
        if (out.length >= max) break
      }
    }
    return out
  }
}

function cleanStrings(arr: unknown[]): string[] {
  return arr
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length >= 1)
}
