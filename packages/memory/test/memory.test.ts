import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryLongTerm, ShortTermMemory } from '../src/index.js'

describe('shortTermMemory', () => {
  let memory: ShortTermMemory

  beforeEach(() => {
    memory = new ShortTermMemory(10)
  })

  it('should add an entry', () => {
    const entry = memory.add('Hello', 'user')
    expect(entry.content).toBe('Hello')
    expect(entry.role).toBe('user')
    expect(entry.id).toBeDefined()
  })

  it('should get an entry by id', () => {
    const entry = memory.add('Test', 'assistant')
    const found = memory.get(entry.id)
    expect(found).toBe(entry)
  })

  it('should get recent entries', () => {
    memory.add('1', 'user')
    memory.add('2', 'assistant')
    memory.add('3', 'user')
    expect(memory.getRecent(2)).toHaveLength(2)
  })

  it('should update an entry', () => {
    const entry = memory.add('Old', 'user')
    memory.update(entry.id, { content: 'New', importance: 0.8 })
    expect(memory.get(entry.id)?.content).toBe('New')
    expect(memory.get(entry.id)?.importance).toBe(0.8)
  })

  it('should delete an entry', () => {
    const entry = memory.add('To delete', 'user')
    expect(memory.delete(entry.id)).toBe(true)
    expect(memory.get(entry.id)).toBeUndefined()
  })

  it('should clear all entries', () => {
    memory.add('a', 'user')
    memory.add('b', 'assistant')
    memory.clear()
    expect(memory.size()).toBe(0)
  })

  it('should get important entries', () => {
    const e1 = memory.add('Important', 'assistant')
    memory.update(e1.id, { importance: 0.9 })
    memory.add('Not important', 'user')
    const important = memory.getImportant(5, 0.5)
    expect(important).toHaveLength(1)
    expect(important[0].content).toBe('Important')
  })

  it('should trim when exceeding max entries', () => {
    const smallMem = new ShortTermMemory(5)
    for (let i = 0; i < 10; i++) {
      smallMem.add(`entry_${i}`, 'user')
    }
    expect(smallMem.size()).toBeLessThanOrEqual(5)
  })
})

describe('inMemoryLongTerm', () => {
  let store: InMemoryLongTerm

  beforeEach(() => {
    store = new InMemoryLongTerm()
  })

  it('should add and search entries', async () => {
    await store.add({
      id: '1',
      content: 'TypeScript is a typed superset of JavaScript',
      role: 'assistant',
      timestamp: Date.now(),
    })
    await store.add({
      id: '2',
      content: 'Rust is a systems programming language',
      role: 'assistant',
      timestamp: Date.now(),
    })

    const results = await store.search('typescript')
    expect(results).toHaveLength(1)
    expect(results[0].content).toContain('TypeScript')
  })

  it('should delete an entry', async () => {
    await store.add({
      id: '1',
      content: 'Test',
      role: 'user',
      timestamp: Date.now(),
    })
    expect(await store.delete('1')).toBe(true)
    expect(await store.delete('nonexistent')).toBe(false)
  })
})
