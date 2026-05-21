import { describe, expect, it } from 'vitest'
import { AgenticRAGGraph } from '../src/index.js'

describe('stage07A agentic RAG graph', () => {
  it('rewrites and retries when retrieval is not relevant', async () => {
    const graph = new AgenticRAGGraph({
      retrieve: async (query) => query.includes('expanded')
        ? [{ id: 'doc-1', source: 'kb.md', content: 'expanded answer', score: 0.8 }]
        : [],
      grade: async (_query, results) => results.length > 0,
      rewrite: async (query) => `${query} expanded`,
      maxAttempts: 2,
    })

    const state = await graph.run('rag')
    expect(state.retrieved).toHaveLength(1)
    expect(state.steps.map((step) => step.node)).toContain('rewrite')
    expect(state.answer).toContain('kb.md')
  })
})
