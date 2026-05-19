import { describe, expect, it } from 'vitest'
import type { LLMClient } from '@ai-agent-study/llm-client'
import type { SearchResult } from '@ai-agent-study/vectorstore'
import { MultiKnowledgeRouter, type KnowledgeBase } from '../src/index.js'

function makeKB(name: string): KnowledgeBase {
  return {
    name,
    description: `KB ${name}`,
    async search(): Promise<SearchResult[]> {
      return []
    },
    async filter() {
      return []
    },
  }
}

function mockClient(result: object): LLMClient {
  return {
    async chat() {
      return {
        content: JSON.stringify(result),
        finishReason: 'stop',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      }
    },
  } as unknown as LLMClient
}

describe('MultiKnowledgeRouter', () => {
  it('returns empty when no KB registered', async () => {
    const router = new MultiKnowledgeRouter({ llmClient: mockClient({}) })
    const result = await router.route('any')

    expect(result.primary).toBeNull()
    expect(result.secondary).toEqual([])
  })

  it('skips LLM when only one KB registered', async () => {
    const router = new MultiKnowledgeRouter({
      llmClient: {
        async chat() {
          throw new Error('LLM should NOT be called')
        },
      } as unknown as LLMClient,
    })
    router.register(makeKB('only'))

    const result = await router.route('q')

    expect(result.primary?.name).toBe('only')
    expect(result.secondary).toEqual([])
  })

  it('selects primary + valid secondary, drops unknown names', async () => {
    const router = new MultiKnowledgeRouter({
      llmClient: mockClient({
        primary: 'docs',
        secondary: ['wiki', 'unknown', 'api'],
      }),
    })
    router.register(makeKB('docs'))
    router.register(makeKB('wiki'))
    router.register(makeKB('api'))

    const result = await router.route('q')

    expect(result.primary?.name).toBe('docs')
    expect(result.secondary.map((kb) => kb.name)).toEqual(['wiki', 'api'])
  })

  it('falls back to first KB on LLM failure', async () => {
    const router = new MultiKnowledgeRouter({
      llmClient: {
        async chat() {
          throw new Error('boom')
        },
      } as unknown as LLMClient,
    })
    router.register(makeKB('a'))
    router.register(makeKB('b'))
    router.register(makeKB('c'))

    const result = await router.route('q')

    expect(result.primary?.name).toBe('a')
    expect(result.secondary.map((kb) => kb.name)).toEqual(['b', 'c'])
  })
})
