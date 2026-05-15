import { describe, it, expect } from 'vitest'
import { QueryRewriter } from '../src/query-rewriter.js'

describe('QueryRewriter.parseVariations', () => {
  it('parses {"queries": [...]} format', () => {
    expect(
      QueryRewriter.parseVariations('{"queries":["a","b","c"]}', 5)
    ).toEqual(['a', 'b', 'c'])
  })

  it('parses bare array', () => {
    expect(QueryRewriter.parseVariations('["x","y"]', 3)).toEqual(['x', 'y'])
  })

  it('caps results to max', () => {
    expect(
      QueryRewriter.parseVariations('["a","b","c","d"]', 2)
    ).toEqual(['a', 'b'])
  })

  it('falls back to numbered list', () => {
    const text = `1. typescript generics
2. how to use <T> in TS
3. generic type parameters`
    expect(QueryRewriter.parseVariations(text, 3)).toEqual([
      'typescript generics',
      'how to use <T> in TS',
      'generic type parameters',
    ])
  })

  it('strips quotes in numbered list', () => {
    const text = `1. "first"
2. 「second」`
    expect(QueryRewriter.parseVariations(text, 2)).toEqual(['first', 'second'])
  })

  it('handles bullet list', () => {
    const text = `- alpha
- beta
- gamma`
    expect(QueryRewriter.parseVariations(text, 3)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('returns empty for empty input', () => {
    expect(QueryRewriter.parseVariations('', 3)).toEqual([])
  })

  it('filters non-string entries silently', () => {
    expect(
      QueryRewriter.parseVariations('{"queries":["a",123,"b",null]}', 5)
    ).toEqual(['a', 'b'])
  })
})

describe('QueryRewriter (with mock client)', () => {
  it('expand always includes original query (deduped)', async () => {
    const r = new QueryRewriter({
      client: {
        chat: async () => ({ content: '{"queries":["query A","query B"]}' }),
      } as never,
    })
    const result = await r.expand('original')
    expect(result[0]).toBe('original')
    expect(result).toContain('query A')
    expect(result).toContain('query B')
  })

  it('on client failure returns just the original query', async () => {
    const r = new QueryRewriter({
      client: {
        chat: async () => {
          throw new Error('boom')
        },
      } as never,
    })
    const result = await r.rewrite('orig')
    expect(result.rewritten).toEqual(['orig'])
  })
})
