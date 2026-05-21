import { ingestDocuments, MemoryDocumentLoader } from '@ai-agent-study/retrieval'
import { describe, expect, it } from 'vitest'
import { compareHybridStrategies } from '../src/index.js'

describe('stage06C hybrid search', () => {
  it('returns both weighted and RRF fused results', async () => {
    const docs = await new MemoryDocumentLoader([
      { source: 'a.md', content: 'semantic vector search' },
      { source: 'b.md', content: 'BM25 exact keyword retrieval' },
    ]).load()
    const { chunks } = await ingestDocuments(docs)
    const vectorResults = chunks.map((chunk, index) => ({
      id: chunk.id,
      source: chunk.source,
      content: chunk.content,
      score: index === 0 ? 0.9 : 0.2,
    }))

    const result = await compareHybridStrategies(chunks, vectorResults, 'BM25 keyword')
    expect(result.weighted[0].rank).toBe(1)
    expect(result.rrf[0].rank).toBe(1)
  })
})
