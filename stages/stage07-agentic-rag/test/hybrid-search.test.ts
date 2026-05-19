import { describe, expect, it } from 'vitest'
import type { SearchResult } from '@ai-agent-study/vectorstore'
import { HybridSearchEngine, type KnowledgeBase } from '../src/index.js'

function fixedKB(name: string, results: { id: string; score: number }[]): KnowledgeBase {
  return {
    name,
    description: `KB ${name}`,
    async search(): Promise<SearchResult[]> {
      return results.map(({ id, score }) => ({
        id,
        score,
        document: { id, content: `content of ${id}`, metadata: { source: name } },
      }))
    },
    async filter() {
      return []
    },
  }
}

describe('HybridSearchEngine', () => {
  it('fuses vector and keyword scores with default weights', async () => {
    // Three docs per KB so min-max normalization doesn't crush mid scores to 0.
    // doc2 hits both KBs at high (but not max) score → wins after weighted sum:
    //   doc1: 1.0 * 0.7 = 0.7
    //   doc2: 0.8 * 0.7 + 0.8 * 0.3 = 0.8   ← winner
    //   doc4: 1.0 * 0.3 = 0.3
    const vectorKB = fixedKB('vector', [
      { id: 'doc1', score: 1.0 },
      { id: 'doc2', score: 0.9 },
      { id: 'doc3', score: 0.5 },
    ])
    const keywordKB = fixedKB('keyword', [
      { id: 'doc4', score: 1.0 },
      { id: 'doc2', score: 0.8 },
      { id: 'doc5', score: 0.0 },
    ])

    const hybrid = new HybridSearchEngine(vectorKB, keywordKB)
    const results = await hybrid.search('q', 10)

    expect(results[0].document.id).toBe('doc2')
  })

  it('respects custom weights and overFetchMultiplier', async () => {
    const vectorKB = fixedKB('v', [{ id: 'a', score: 1 }])
    const keywordKB = fixedKB('k', [{ id: 'b', score: 1 }])

    const hybrid = new HybridSearchEngine(vectorKB, keywordKB, {
      vectorWeight: 0.0,
      keywordWeight: 1.0,
      overFetchMultiplier: 1,
    })

    const results = await hybrid.search('q', 5)

    // With vector weight = 0, "b" (keyword-only) should outrank "a"
    expect(results[0].document.id).toBe('b')
  })

  it('handles empty results from one KB', async () => {
    const vectorKB = fixedKB('v', [{ id: 'a', score: 1 }])
    const emptyKB = fixedKB('empty', [])
    const hybrid = new HybridSearchEngine(vectorKB, emptyKB)

    const results = await hybrid.search('q', 5)

    expect(results.length).toBe(1)
    expect(results[0].document.id).toBe('a')
  })

  it('slices to topK', async () => {
    const vectorKB = fixedKB(
      'v',
      Array.from({ length: 20 }, (_, i) => ({ id: `v${i}`, score: 1 - i * 0.05 }))
    )
    const keywordKB = fixedKB('k', [])
    const hybrid = new HybridSearchEngine(vectorKB, keywordKB)

    const results = await hybrid.search('q', 5)

    expect(results.length).toBe(5)
  })
})
