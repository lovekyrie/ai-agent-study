import { describe, expect, it } from 'vitest'
import { Reranker } from '../src/reranker.js'

describe('reranker.parseScores', () => {
  it('parses {scores: [...]} format', () => {
    expect(Reranker.parseScores('{"scores":[0.9, 0.3, 0.5]}', 3)).toEqual([0.9, 0.3, 0.5])
  })

  it('parses bare array', () => {
    expect(Reranker.parseScores('[0.1, 0.2]', 2)).toEqual([0.1, 0.2])
  })

  it('parses indexed object {"0":0.9,"1":0.3}', () => {
    expect(Reranker.parseScores('{"0":0.9,"1":0.3}', 2)).toEqual([0.9, 0.3])
  })

  it('clamps values into [0,1]', () => {
    expect(Reranker.parseScores('{"scores":[1.5, -0.3, 0.5]}', 3)).toEqual([1, 0, 0.5])
  })

  it('fills NaN for missing or non-numeric entries', () => {
    const r = Reranker.parseScores('{"scores":[0.9]}', 3)
    expect(r[0]).toBe(0.9)
    expect(Number.isNaN(r[1])).toBe(true)
    expect(Number.isNaN(r[2])).toBe(true)
  })

  it('handles empty / unparseable input', () => {
    const r = Reranker.parseScores('garbage', 2)
    expect(r.every(Number.isNaN)).toBe(true)
  })

  it('extracts JSON from surrounding text (lenient mode)', () => {
    const text = 'Here are the scores: {"scores":[0.7,0.2]} done.'
    expect(Reranker.parseScores(text, 2)).toEqual([0.7, 0.2])
  })
})

describe('reranker.rerank (with mock client)', () => {
  it('returns original on empty input', async () => {
    const r = new Reranker({
      client: { chat: async () => ({ content: '{"scores":[]}' }) } as never,
    })
    expect(await r.rerank('q', [])).toEqual([])
  })

  it('returns single result with score=1.0', async () => {
    const r = new Reranker({
      client: { chat: async () => ({ content: '{"scores":[1]}' }) } as never,
    })
    const result = await r.rerank('q', [
      {
        score: 0.3,
        document: { id: 'a', content: 'x' },
      },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(1.0)
    expect(result[0].originalScore).toBe(0.3)
  })

  it('re-sorts by LLM scores', async () => {
    const client = {
      chat: async () => ({ content: '{"scores":[0.2, 0.9, 0.5]}' }),
    } as never
    const r = new Reranker({ client })
    const result = await r.rerank('q', [
      { score: 1.0, document: { id: 'a', content: 'aaa' } },
      { score: 0.5, document: { id: 'b', content: 'bbb' } },
      { score: 0.3, document: { id: 'c', content: 'ccc' } },
    ])
    expect(result.map(r => r.document.id)).toEqual(['b', 'c', 'a'])
  })

  it('falls back to original order on parse failure', async () => {
    const client = { chat: async () => ({ content: 'not-json' }) } as never
    const r = new Reranker({ client })
    const result = await r.rerank('q', [
      { score: 0.9, document: { id: 'a', content: 'x' } },
      { score: 0.5, document: { id: 'b', content: 'y' } },
    ])
    expect(result.map(r => r.document.id)).toEqual(['a', 'b'])
  })
})
