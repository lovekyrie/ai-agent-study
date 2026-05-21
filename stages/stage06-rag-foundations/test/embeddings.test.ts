import { describe, expect, it } from 'vitest'
import { cosineSimilarity, Embedder, pseudoVector } from '../src/embeddings.js'

describe('cosineSimilarity', () => {
  it('returns 0 for empty / mismatched vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0)
    expect(cosineSimilarity([1, 0], [1])).toBe(0)
  })

  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6)
  })

  it('returns negative for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6)
  })

  it('is symmetric', () => {
    const a = [0.5, 1.2, -0.3]
    const b = [0.1, 0.4, 0.9]
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 6)
  })
})

describe('pseudoVector', () => {
  it('returns deterministic vectors of given dimension', () => {
    const v1 = pseudoVector('hello', 16)
    const v2 = pseudoVector('hello', 16)
    expect(v1).toEqual(v2)
    expect(v1.length).toBe(16)
  })

  it('produces unit-norm vectors', () => {
    const v = pseudoVector('test', 8)
    const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
    expect(mag).toBeCloseTo(1, 5)
  })
})

describe('embedder', () => {
  it('falls back to stub provider when no API key', () => {
    const e = new Embedder({ apiKey: '', dimensions: 8 })
    expect(e.getProvider()).toBe('stub')
  })

  it('stub embeddings are deterministic and unit-norm', async () => {
    const e = new Embedder({ provider: 'stub', dimensions: 8 })
    const r1 = await e.embed(['hello'])
    const r2 = await e.embed(['hello'])
    expect(r1[0].embedding).toEqual(r2[0].embedding)
    const mag = Math.sqrt(r1[0].embedding.reduce((s, x) => s + x * x, 0))
    expect(mag).toBeCloseTo(1, 5)
  })

  it('returns empty for empty input', async () => {
    const e = new Embedder({ provider: 'stub' })
    expect(await e.embed([])).toEqual([])
  })

  it('explicit openai provider without key throws when used', async () => {
    const e = new Embedder({ provider: 'openai', apiKey: '' })
    await expect(e.embed(['hi'])).rejects.toThrow(/OPENAI_API_KEY/)
  })
})
