import { describe, expect, it } from 'vitest'
import {
  HybridRetriever,
  InMemoryLexicalIndex,
  MemoryDocumentLoader,
  ingestDocuments,
  reciprocalRankFusion,
  splitCodeByLines,
  weightedFusion,
} from '../src/index.js'

describe('retrieval package', () => {
  it('loads, splits and deduplicates documents', async () => {
    const loader = new MemoryDocumentLoader([
      { source: 'guide.md', content: '# RAG\n\nHybrid search combines vectors and BM25.' },
      { source: 'guide-copy.md', content: '# RAG\n\nHybrid search combines vectors and BM25.' },
    ])

    const documents = await loader.load()
    const result = await ingestDocuments(documents, { maxChars: 200, overlapChars: 20 })

    expect(result.chunks).toHaveLength(1)
    expect(result.duplicatesRemoved).toBe(1)
    expect(result.chunks[0].metadata.heading).toBe('RAG')
  })

  it('tracks line ranges for code chunks', () => {
    const chunks = splitCodeByLines(
      {
        source: 'agent.ts',
        content: ['export function plan() {', '  return "retrieve"', '}', 'export function answer() {}'].join('\n'),
      },
      { maxChars: 45, overlapChars: 5 }
    )

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].loc).toEqual({ startLine: 1, endLine: 2 })
  })

  it('combines lexical and vector results with weighted fusion and RRF', async () => {
    const documents = await new MemoryDocumentLoader([
      { source: 'a.md', content: 'Milvus stores vector embeddings for semantic search.' },
      { source: 'b.md', content: 'Elasticsearch uses BM25 for lexical search.' },
    ]).load()
    const { chunks } = await ingestDocuments(documents, { maxChars: 200 })
    const lexical = new InMemoryLexicalIndex()
    lexical.add(chunks)
    const vectorSearch = async () => [
      { id: chunks[0].id, content: chunks[0].content, source: chunks[0].source, score: 0.9 },
      { id: chunks[1].id, content: chunks[1].content, source: chunks[1].source, score: 0.4 },
    ]

    const retriever = new HybridRetriever(vectorSearch, lexical)
    const weighted = await retriever.search('BM25 vector search', { topK: 2 })
    const rrf = reciprocalRankFusion([weighted, lexical.search('BM25', 2)], 2)
    const fused = weightedFusion(weighted, lexical.search('BM25', 2), { topK: 2 })

    expect(weighted).toHaveLength(2)
    expect(rrf[0].rank).toBe(1)
    expect(fused[0].score).toBeGreaterThan(0)
  })
})
