import type { Chunk } from '../src/index.js'
import { describe, expect, it } from 'vitest'
import {
  AdvancedRAG,

  chunkText,
  Embedder,
  InMemoryVectorStore,
  QueryRewriter,
  Reranker,
} from '../src/index.js'

/**
 * 检索基础评估：Precision@k / Recall@k / Hit Rate / MRR。
 *
 * 这些指标是 RAG 系统的"血压计"——任何 chunk size / embedding model / rerank 改动
 * 都应该在固定的 golden set 上对比这几个数。stage10 会做更系统的评估，
 * 这里只让你**摸到指标的形状**。
 */

interface GoldenCase {
  query: string
  /** 这条 query 应该召回的"正确" chunk id（可以多个） */
  relevantIds: string[]
}

interface RetrievalMetrics {
  /** 命中至少一个相关文档的 query 比例 */
  hitRate: number
  /** Precision@k：检索结果里相关文档的比例（求 macro 平均） */
  precisionAtK: number
  /** Recall@k：每条 query 召回到的相关文档比例（macro 平均） */
  recallAtK: number
  /** Mean Reciprocal Rank：第一个相关文档排名的倒数（macro 平均） */
  mrr: number
}

function evaluateRetrieval(
  retrieved: { id: string }[][],
  goldenCases: GoldenCase[],
  k: number,
): RetrievalMetrics {
  if (retrieved.length !== goldenCases.length) {
    throw new Error('retrieved and goldenCases must align 1:1')
  }
  if (goldenCases.length === 0) {
    return { hitRate: 0, precisionAtK: 0, recallAtK: 0, mrr: 0 }
  }

  let hits = 0
  let precisionSum = 0
  let recallSum = 0
  let rrSum = 0

  for (let i = 0; i < goldenCases.length; i++) {
    const relevant = new Set(goldenCases[i].relevantIds)
    const top = retrieved[i].slice(0, k)
    const hitsInTop = top.filter(r => relevant.has(r.id)).length

    if (hitsInTop > 0)
      hits += 1
    precisionSum += top.length > 0 ? hitsInTop / top.length : 0
    recallSum += relevant.size > 0 ? hitsInTop / relevant.size : 0

    // 第一个相关文档的 1-indexed rank
    const firstHitIdx = top.findIndex(r => relevant.has(r.id))
    rrSum += firstHitIdx >= 0 ? 1 / (firstHitIdx + 1) : 0
  }

  return {
    hitRate: hits / goldenCases.length,
    precisionAtK: precisionSum / goldenCases.length,
    recallAtK: recallSum / goldenCases.length,
    mrr: rrSum / goldenCases.length,
  }
}

describe('retrieval evaluation primitives', () => {
  it('computes perfect metrics on perfect retrieval', () => {
    const retrieved = [
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [{ id: 'x' }, { id: 'y' }],
    ]
    const golden: GoldenCase[] = [
      { query: 'q1', relevantIds: ['a'] },
      { query: 'q2', relevantIds: ['x'] },
    ]

    const m = evaluateRetrieval(retrieved, golden, 3)

    expect(m.hitRate).toBe(1)
    expect(m.mrr).toBe(1) // first hit at rank 1 for both
    expect(m.recallAtK).toBe(1)
  })

  it('captures partial recall when only some relevant docs surface', () => {
    const retrieved = [[{ id: 'a' }, { id: 'wrong' }, { id: 'wrong2' }]]
    const golden: GoldenCase[] = [{ query: 'q', relevantIds: ['a', 'b', 'c'] }]

    const m = evaluateRetrieval(retrieved, golden, 3)

    expect(m.hitRate).toBe(1)
    expect(m.recallAtK).toBeCloseTo(1 / 3, 5)
    expect(m.precisionAtK).toBeCloseTo(1 / 3, 5)
    expect(m.mrr).toBe(1) // first hit at rank 1
  })

  it('reflects MRR when relevant doc appears later', () => {
    const retrieved = [[{ id: 'wrong' }, { id: 'wrong' }, { id: 'a' }]]
    const golden: GoldenCase[] = [{ query: 'q', relevantIds: ['a'] }]

    const m = evaluateRetrieval(retrieved, golden, 3)

    expect(m.mrr).toBeCloseTo(1 / 3, 5)
    expect(m.hitRate).toBe(1)
  })

  it('zero hits when no relevant docs in top-k', () => {
    const retrieved = [[{ id: 'wrong' }, { id: 'wrong2' }]]
    const golden: GoldenCase[] = [{ query: 'q', relevantIds: ['a'] }]

    const m = evaluateRetrieval(retrieved, golden, 2)

    expect(m.hitRate).toBe(0)
    expect(m.recallAtK).toBe(0)
    expect(m.mrr).toBe(0)
  })
})

describe('advancedRAG end-to-end retrieval (stub embedder)', () => {
  // 即使是 stub embedder（哈希向量，无真实语义），同一段文本的 embedding 是
  // 完全相同的 → 自检索一定能命中自己。
  // 这就是 stage06 在没有 API key 时也能做"形状检查"的原因。

  it('retrieves the indexed chunk verbatim with stub embedder', async () => {
    const rag = new AdvancedRAG({
      embedder: new Embedder({ provider: 'stub', dimensions: 64 }),
      vectorStore: new InMemoryVectorStore(),
      reranker: new Reranker(),
      queryRewriter: new QueryRewriter(),
    })

    const docs = [
      'TypeScript is a typed superset of JavaScript.',
      'Rust guarantees memory safety without garbage collection.',
      'Python is dynamically typed and often used in data science.',
    ]
    const chunks: Chunk[] = docs.map((content, i) => ({
      id: `doc-${i}`,
      content,
      metadata: { source: `doc-${i}.txt`, startLine: 0, endLine: 0 },
    }))
    await rag.index(chunks)

    // useRewrite=false / useRerank=false → 走纯向量检索，避免 LLM 调用
    const result = await rag.retrieve(docs[0], {
      useRewrite: false,
      useRerank: false,
    })

    expect(result.chunks.length).toBeGreaterThan(0)
    // The exact same text should be ranked first (cosine similarity = 1)
    expect(result.chunks[0].id).toBe('doc-0')
  })

  it('chunkText produces stable ids and respects size hints', () => {
    const text = 'paragraph one.\n\nparagraph two.\n\nparagraph three.'
    const chunks = chunkText(text, 'src.txt', { chunkSize: 50, chunkOverlap: 10 })

    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.every(c => c.id.length > 0)).toBe(true)
    expect(chunks.every(c => c.metadata.source === 'src.txt')).toBe(true)
  })

  it('measures hit rate / MRR on a tiny golden set', async () => {
    const rag = new AdvancedRAG({
      embedder: new Embedder({ provider: 'stub', dimensions: 64 }),
      vectorStore: new InMemoryVectorStore(),
    })

    const corpus = [
      { id: 'ts-1', content: 'TypeScript is a typed superset of JavaScript.' },
      { id: 'ts-2', content: 'TypeScript supports interfaces and generics.' },
      { id: 'rs-1', content: 'Rust guarantees memory safety without GC.' },
      { id: 'py-1', content: 'Python is dynamically typed.' },
    ]
    await rag.index(
      corpus.map(c => ({
        id: c.id,
        content: c.content,
        metadata: { source: c.id, startLine: 0, endLine: 0 },
      })),
    )

    // 用文档自身作为 query 是 stub embedder 下"必中"的 sanity check
    const golden: GoldenCase[] = corpus.map(c => ({
      query: c.content,
      relevantIds: [c.id],
    }))

    const retrieved = await Promise.all(
      golden.map(async (g) => {
        const r = await rag.retrieve(g.query, { useRewrite: false, useRerank: false })
        return r.chunks
      }),
    )

    const m = evaluateRetrieval(retrieved, golden, 3)
    expect(m.hitRate).toBe(1)
    expect(m.mrr).toBe(1)
  })
})
