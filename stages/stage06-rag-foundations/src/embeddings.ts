import { createHash } from 'node:crypto'
import axios from 'axios'

export interface EmbeddingResult {
  id: string
  embedding: number[]
  content: string
  metadata: Record<string, unknown>
}

export interface EmbedderOptions {
  /** OpenAI 兼容 embeddings 模型，默认 text-embedding-3-small */
  model?: string
  /** 向量维度。stub 模式生效；真实模式以 API 返回为准 */
  dimensions?: number
  /** 单批请求条数 */
  batchSize?: number
  /** API base URL，默认从 env 读取 */
  baseURL?: string
  /** API key，默认从 env 读取 */
  apiKey?: string
  /**
   * 嵌入提供方
   * - 'openai'（默认）：调用真实 API，需要 API key
   * - 'stub'：本地哈希伪嵌入，仅用于离线测试和 pipeline 演示（无语义）
   */
  provider?: 'openai' | 'stub'
}

const DEFAULT_DIMENSIONS = 1536

export class Embedder {
  private readonly model: string
  private readonly dimensions: number
  private readonly batchSize: number
  private readonly baseURL: string
  private readonly apiKey: string
  private readonly provider: 'openai' | 'stub'

  constructor(options: EmbedderOptions = {}) {
    this.model = options.model ?? 'text-embedding-3-small'
    this.dimensions = options.dimensions ?? DEFAULT_DIMENSIONS
    this.batchSize = options.batchSize ?? 100
    this.baseURL = options.baseURL ?? process.env.OPENAI_API_BASE ?? 'https://api.minimaxi.com/v1'
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? ''
    // 默认按是否有 apiKey 自动选 provider；用户可显式覆盖
    this.provider = options.provider ?? (this.apiKey ? 'openai' : 'stub')
  }

  async embed(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0)
      return []
    const results: EmbeddingResult[] = []
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize)
      const batchResults
        = this.provider === 'openai'
          ? await this.embedOpenAI(batch)
          : this.embedStub(batch)
      results.push(...batchResults)
    }
    return results
  }

  private async embedOpenAI(texts: string[]): Promise<EmbeddingResult[]> {
    if (!this.apiKey) {
      throw new Error('Embedder: OPENAI_API_KEY missing (use provider:"stub" for offline mode)')
    }
    const { data } = await axios.post(
      `${this.baseURL}/embeddings`,
      { model: this.model, input: texts },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      },
    )

    const items = (data?.data ?? []) as Array<{ index: number, embedding: number[] }>
    return items
      .sort((a, b) => a.index - b.index)
      .map((item, i) => ({
        id: `emb_${Date.now()}_${i}`,
        embedding: item.embedding,
        content: texts[i],
        metadata: { model: this.model, provider: 'openai' as const },
      }))
  }

  private embedStub(texts: string[]): EmbeddingResult[] {
    return texts.map((text, idx) => ({
      id: `emb_${Date.now()}_${idx}`,
      embedding: pseudoVector(text, this.dimensions),
      content: text,
      metadata: { model: this.model, provider: 'stub' as const, hint: 'no real semantics' },
    }))
  }

  getDimensions(): number {
    return this.dimensions
  }

  getModel(): string {
    return this.model
  }

  getProvider(): 'openai' | 'stub' {
    return this.provider
  }
}

/**
 * Deterministic hash-based pseudo embedding. 仅用于离线测试 / pipeline 形状演示。
 * 注意：完全没有语义；不同文本几乎正交。
 */
export function pseudoVector(text: string, dim = DEFAULT_DIMENSIONS): number[] {
  const hash = createHash('sha256').update(text).digest()
  const vec: number[] = new Array(dim)
  for (let i = 0; i < dim; i++) {
    vec[i] = (hash[i % hash.length] / 255) * 2 - 1
  }
  // L2 归一化
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0))
  if (mag === 0)
    return vec
  for (let i = 0; i < dim; i++) vec[i] /= mag
  return vec
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0)
    return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}
