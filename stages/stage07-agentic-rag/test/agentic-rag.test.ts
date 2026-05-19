import { describe, expect, it } from 'vitest'
import type { LLMClient } from '@ai-agent-study/llm-client'
import type { SearchResult } from '@ai-agent-study/vectorstore'
import { AgenticRAG, type KnowledgeBase } from '../src/index.js'

function makeKB(name: string, docs: string[]): KnowledgeBase {
  return {
    name,
    description: `KB ${name}`,
    async search(query: string, topK = 5): Promise<SearchResult[]> {
      const lower = query.toLowerCase()
      return docs
        .map((content, i) => ({ content, i }))
        .filter(({ content }) => content.toLowerCase().includes(lower))
        .slice(0, topK)
        .map(({ content, i }) => ({
          id: `${name}-${i}`,
          score: 1 - i * 0.1,
          document: {
            id: `${name}-${i}`,
            content,
            metadata: { source: name },
          },
        }))
    },
    async filter() {
      return []
    },
  }
}

function mockClient(plan: object): LLMClient {
  return {
    async chat() {
      return {
        content: JSON.stringify(plan),
        finishReason: 'stop',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      }
    },
  } as unknown as LLMClient
}

describe('AgenticRAG.planRetrieval', () => {
  it('returns empty plan when no KB registered', async () => {
    const rag = new AgenticRAG({ llmClient: mockClient({}) })
    const plan = await rag.planRetrieval('any')

    expect(plan.knowledgeBases).toEqual([])
    expect(plan.topK).toBe(0)
  })

  it('clamps topK to maxTopK and filters unknown KB names', async () => {
    const rag = new AgenticRAG({
      llmClient: mockClient({
        knowledgeBases: ['ts', 'unknown'],
        query: 'optimized',
        topK: 9999,
        useHybrid: false,
        reasoning: 'test',
      }),
      maxTopK: 50,
    })
    rag.registerKnowledgeBase(makeKB('ts', ['TypeScript is great']))

    const plan = await rag.planRetrieval('typescript')

    expect(plan.knowledgeBases).toEqual(['ts'])
    expect(plan.topK).toBe(50)
    expect(plan.query).toBe('optimized')
  })

  it('falls back to default plan when LLM fails', async () => {
    const failing: LLMClient = {
      async chat() {
        throw new Error('boom')
      },
    } as unknown as LLMClient
    const rag = new AgenticRAG({ llmClient: failing })
    rag.registerKnowledgeBase(makeKB('a', ['x']))
    rag.registerKnowledgeBase(makeKB('b', ['y']))

    const plan = await rag.planRetrieval('q')

    expect(plan.knowledgeBases).toEqual(['a', 'b'])
    expect(plan.reasoning).toMatch(/failure/i)
  })
})

describe('AgenticRAG.retrieve', () => {
  it('dedupes across KBs and slices to topK', async () => {
    const rag = new AgenticRAG({
      llmClient: mockClient({
        knowledgeBases: ['ts'],
        query: 'typescript',
        topK: 2,
        useHybrid: false,
        reasoning: 'test',
      }),
    })
    rag.registerKnowledgeBase(
      makeKB('ts', [
        'TypeScript is a typed language',
        'TypeScript supports generics',
        'TypeScript compiles to JavaScript',
      ])
    )

    const results = await rag.retrieve('typescript')

    expect(results.length).toBe(2)
    // Sorted by score desc
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score)
  })
})
