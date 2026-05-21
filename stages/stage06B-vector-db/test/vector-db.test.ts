import { describe, expect, it } from 'vitest'
import { MemoryDocumentLoader, ingestDocuments } from '@ai-agent-study/retrieval'
import { InMemoryVectorStoreAdapter } from '@ai-agent-study/vectorstore'
import { indexChunks, rebuildSource } from '../src/index.js'

describe('stage06B vector db', () => {
  it('indexes and rebuilds chunks through the adapter interface', async () => {
    const documents = await new MemoryDocumentLoader([
      { source: 'a.md', content: 'Milvus and Chroma are vector databases.' },
      { source: 'b.md', content: 'Redis is useful for cache and queues.' },
    ]).load()
    const { chunks } = await ingestDocuments(documents)
    const store = new InMemoryVectorStoreAdapter()

    expect((await indexChunks(store, chunks)).count).toBe(2)
    expect(await store.search('vector databases')).toHaveLength(1)
    expect((await rebuildSource(store, 'a.md', chunks)).count).toBe(2)
  })
})
