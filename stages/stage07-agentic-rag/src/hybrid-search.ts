import type { SearchResult } from '@ai-agent-study/vectorstore'
import type { KnowledgeBase } from './types.js'

export interface HybridSearchOptions {
  /** 向量分量权重，默认 0.7（向量主，关键词辅） */
  vectorWeight?: number
  /** 关键词分量权重，默认 0.3 */
  keywordWeight?: number
  /** 每个子 KB 的"过采"倍数，默认 2（确保有足够候选做融合） */
  overFetchMultiplier?: number
}

/**
 * 混合搜索：把向量召回 + 关键词召回的分数 min-max 归一化后加权求和。
 *
 * 为什么不直接拼接？分数尺度不同（向量 cosine ∈ [-1,1]，关键词 BM25 可能更大），
 * 归一化后才能合理加权。
 */
export class HybridSearchEngine {
  private readonly vectorKB: KnowledgeBase
  private readonly keywordKB: KnowledgeBase
  private readonly vectorWeight: number
  private readonly keywordWeight: number
  private readonly overFetch: number

  constructor(vectorKB: KnowledgeBase, keywordKB: KnowledgeBase, options: HybridSearchOptions = {}) {
    this.vectorKB = vectorKB
    this.keywordKB = keywordKB
    this.vectorWeight = options.vectorWeight ?? 0.7
    this.keywordWeight = options.keywordWeight ?? 0.3
    this.overFetch = options.overFetchMultiplier ?? 2
  }

  async search(query: string, topK = 10): Promise<SearchResult[]> {
    const fetchK = topK * this.overFetch
    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorKB.search(query, fetchK),
      this.keywordKB.search(query, fetchK),
    ])

    const normalizedVector = normalizeScores(vectorResults)
    const normalizedKeyword = normalizeScores(keywordResults)
    const scoreMap = new Map<string, { result: SearchResult, score: number }>()

    for (const r of normalizedVector) {
      scoreMap.set(r.result.document.id, {
        result: r.result,
        score: r.score * this.vectorWeight,
      })
    }

    for (const r of normalizedKeyword) {
      const existing = scoreMap.get(r.result.document.id)
      if (existing) {
        existing.score += r.score * this.keywordWeight
      }
      else {
        scoreMap.set(r.result.document.id, {
          result: r.result,
          score: r.score * this.keywordWeight,
        })
      }
    }

    return Array.from(scoreMap.values())
      .map(({ result, score }) => ({ ...result, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }
}

function normalizeScores(
  results: SearchResult[],
): { result: SearchResult, score: number }[] {
  if (results.length === 0)
    return []
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
