import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryCollection } from '../src/index.js'

describe('InMemoryCollection', () => {
  let store: InMemoryCollection

  beforeEach(() => {
    store = new InMemoryCollection('test')
  })

  const docs = [
    { id: '1', content: 'TypeScript is a typed superset of JavaScript', metadata: { type: 'language' } },
    { id: '2', content: 'Rust is a systems programming language', metadata: { type: 'language' } },
    { id: '3', content: 'React is a UI library for building interfaces', metadata: { type: 'framework' } },
    { id: '4', content: 'PostgreSQL is a relational database system', metadata: { type: 'database' } },
  ]

  it('should add documents', async () => {
    await store.add(docs)
    const stats = await store.stats()
    expect(stats.count).toBe(4)
  })

  it('should update existing document on re-add with same id', async () => {
    await store.add([docs[0]])
    await store.add([{ id: '1', content: 'Updated content' }])
    const stats = await store.stats()
    expect(stats.count).toBe(1)
  })

  it('should search by keyword', async () => {
    await store.add(docs)
    const results = await store.search('typescript')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].document.content).toContain('TypeScript')
  })

  it('should search with metadata filter', async () => {
    await store.add(docs)
    const results = await store.search('language', { filter: { type: 'language' } })
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  it('should respect topK', async () => {
    await store.add(docs)
    const results = await store.search('language', { topK: 1 })
    expect(results).toHaveLength(1)
  })

  it('should delete documents', async () => {
    await store.add(docs)
    await store.delete(['1', '2'])
    const stats = await store.stats()
    expect(stats.count).toBe(2)
  })

  it('should update a document', async () => {
    await store.add(docs)
    await store.update('1', { content: 'TypeScript is awesome', metadata: { type: 'language', updated: 'true' } })
    const results = await store.search('awesome')
    expect(results[0].document.content).toBe('TypeScript is awesome')
  })

  it('should return empty for no matches', async () => {
    await store.add(docs)
    const results = await store.search('zzz_nonexistent_zzz')
    expect(results).toHaveLength(0)
  })
})