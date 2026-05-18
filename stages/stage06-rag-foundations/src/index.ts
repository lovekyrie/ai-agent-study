import { Embedder, cosineSimilarity } from './embeddings.js'
import { QueryRewriter } from './query-rewriter.js'
import { Reranker, type RerankResult } from './reranker.js'
import type { SearchResult } from '@ai-agent-study/vectorstore'
import type { Chunk } from './chunking.js'

export type { Chunk } from './chunking.js'
export { Embedder, cosineSimilarity, pseudoVector } from './embeddings.js'
export { Reranker } from './reranker.js'
export { QueryRewriter } from './query-rewriter.js'
export { chunkText, chunkCode, chunkByFile } from './chunking.js'

export interface VectorEntry {
  id: string
  embedding: number[]
  content: string
  metadata: Record<string, unknown>
}

export interface VectorStoreAdapter {
  add(vectors: VectorEntry[]): Promise<void>
  search(
    query: number[],
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<SearchResult[]>
}

export interface AdvancedRAGOptions {
  embedder?: Embedder
  vectorStore?: VectorStoreAdapter
  reranker?: Reranker
  queryRewriter?: QueryRewriter
  defaultTopK?: number
  rerankTopK?: number
}

export interface RetrievalResult {
  chunks: Chunk[]
  scores: number[]
  reranked?: RerankResult[]
}

export class AdvancedRAG {
  private readonly embedder: Embedder
  private readonly vectorStore: VectorStoreAdapter
  private readonly reranker: Reranker
  private readonly queryRewriter: QueryRewriter
  private readonly defaultTopK: number
  private readonly rerankTopK: number

  constructor(options: AdvancedRAGOptions = {}) {
    this.embedder = options.embedder ?? new Embedder()
    this.vectorStore = options.vectorStore ?? new InMemoryVectorStore()
    this.reranker = options.reranker ?? new Reranker()
    this.queryRewriter = options.queryRewriter ?? new QueryRewriter()
    this.defaultTopK = options.defaultTopK ?? 10
    this.rerankTopK = options.rerankTopK ?? 5
  }

  async index(chunks: Chunk[]): Promise<void> {
    if (chunks.length === 0) return
    const texts = chunks.map((c) => c.content)
    const results = await this.embedder.embed(texts)
    if (results.length !== chunks.length) {
      throw new Error(
        `Embedder returned ${results.length} embeddings for ${chunks.length} chunks`
      )
    }

    const vectors: VectorEntry[] = results.map((r, i) => ({
      id: chunks[i].id,
      embedding: r.embedding,
      content: chunks[i].content,
      metadata: { ...chunks[i].metadata, chunkId: chunks[i].id },
    }))

    await this.vectorStore.add(vectors)
  }

  /** 检索；可选查询改写 + LLM rerank。 */
  async retrieve(
    query: string,
    options: { useRerank?: boolean; useRewrite?: boolean } = {}
  ): Promise<RetrievalResult> {
    const { useRerank = true, useRewrite = true } = options

    const queries = useRewrite ? await this.queryRewriter.expand(query) : [query]

    // 每个文档：累计分数 + 命中查询数，最后取均值（只除命中数，避免压低单查询命中的文档）
    const merged = new Map<string, { chunk: Chunk; scoreSum: number; hits: number }>()

    for (const q of queries) {
      const qEmbedding = await this.embedQuery(q)
      const results = await this.vectorStore.search(qEmbedding, this.defaultTopK * 2)
      for (const r of results) {
        const existing = merged.get(r.document.id)
        if (existing) {
          existing.scoreSum += r.score
          existing.hits += 1
        } else {
          merged.set(r.document.id, {
            chunk: {
              id: r.document.id,
              content: r.document.content,
              metadata: (r.document.metadata ?? {}) as Chunk['metadata'],
            },
            scoreSum: r.score,
            hits: 1,
          })
        }
      }
    }

    const entries = Array.from(merged.values()).map((v) => ({
      chunk: v.chunk,
      score: v.scoreSum / v.hits,
    }))

    entries.sort((a, b) => b.score - a.score)
    const topEntries = entries.slice(0, this.defaultTopK)
    const topChunks = topEntries.map((e) => e.chunk)
    const topScores = topEntries.map((e) => e.score)

    if (useRerank && topChunks.length > 1) {
      const searchResults: SearchResult[] = topEntries.map((e) => ({
        score: e.score,
        document: {
          id: e.chunk.id,
          content: e.chunk.content,
          // SearchResult.metadata 是 Record<string, string|number|boolean>，
          // 这里只挑 primitive 字段，避免运行时类型错配
          metadata: pickPrimitiveMetadata(e.chunk.metadata),
        },
      }))
      const reranked = await this.reranker.rerank(query, searchResults, this.rerankTopK)
      return {
        chunks: reranked.map((r) => ({
          id: r.document.id,
          content: r.document.content,
          metadata: r.document.metadata as Chunk['metadata'],
        })),
        scores: reranked.map((r) => r.score),
        reranked,
      }
    }

    return { chunks: topChunks, scores: topScores }
  }

  /** 暴露 queryRewriter 供外部演示（避免 example 用 rag['queryRewriter']） */
  getQueryRewriter(): QueryRewriter {
    return this.queryRewriter
  }

  private async embedQuery(query: string): Promise<number[]> {
    const [result] = await this.embedder.embed([query])
    if (!result) throw new Error('Embedder returned empty result for query')
    return result.embedding
  }
}

function pickPrimitiveMetadata(
  meta: Record<string, unknown>
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v
    }
  }
  return out
}

/**
 * 简易内存向量库：cosine similarity 排序 + 可选元数据 filter。
 * 仅用于开发/测试；生产请用 Chroma/Qdrant。
 */
export class InMemoryVectorStore implements VectorStoreAdapter {
  private vectors: VectorEntry[] = []

  async add(entries: VectorEntry[]): Promise<void> {
    this.vectors.push(...entries)
  }

  async search(
    query: number[],
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<SearchResult[]> {
    const candidates = filter
      ? this.vectors.filter((v) => matchesFilter(v.metadata, filter))
      : this.vectors

    return candidates
      .map((v) => ({
        score: cosineSimilarity(query, v.embedding),
        document: {
          id: v.id,
          content: v.content,
          metadata: pickPrimitiveMetadata(v.metadata),
        },
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  size(): number {
    return this.vectors.length
  }

  clear(): void {
    this.vectors = []
  }
}

function matchesFilter(
  meta: Record<string, unknown>,
  filter: Record<string, unknown>
): boolean {
  for (const [k, v] of Object.entries(filter)) {
    if (meta[k] !== v) return false
  }
  return true
}
