import { describe, expect, it } from 'vitest'
import { InMemoryCollection, InMemoryVectorStoreAdapter } from '../src/index.js'

describe('vector store adapters', () => {
  it('wraps in-memory collection with upsert and deleteByFilter', async () => {
    const adapter = new InMemoryVectorStoreAdapter(new InMemoryCollection('docs'))
    await adapter.upsert([
      { id: '1', content: 'agent rag document', metadata: { source: 'a' } },
      { id: '2', content: 'workflow mcp document', metadata: { source: 'b' } },
    ])

    expect((await adapter.stats()).count).toBe(2)
    expect(await adapter.search('rag')).toHaveLength(1)

    await adapter.deleteByFilter({ source: 'a' })
    expect((await adapter.stats()).count).toBe(1)
  })
})
