import { describe, expect, it } from 'vitest'
import { InMemoryTracer } from '../src/index.js'

describe('InMemoryTracer', () => {
  it('records runs, spans and usage summaries', () => {
    const tracer = new InMemoryTracer()
    const run = tracer.startRun('codebase-agent', { query: 'where is auth?' })
    const retrieval = tracer.startSpan({ runId: run.id, name: 'retrieve', kind: 'retrieval' })
    tracer.endSpan(retrieval.id, { hits: 3 })
    const llm = tracer.startSpan({ runId: run.id, name: 'answer', kind: 'llm' })
    tracer.endSpan(llm.id, { answer: 'auth.ts' }, { inputTokens: 100, outputTokens: 20, totalTokens: 120, estimatedCost: 0.001 })
    tracer.finishRun(run.id, { answer: 'auth.ts' })

    const summary = tracer.summarizeRun(run.id)
    expect(summary.spans).toBe(2)
    expect(summary.usage.totalTokens).toBe(120)
    expect(tracer.toEvalCases('codebase')).toHaveLength(1)
  })

  it('captures span failures without failing the run automatically', () => {
    const tracer = new InMemoryTracer()
    const run = tracer.startRun('workflow')
    const span = tracer.startSpan({ runId: run.id, name: 'tool', kind: 'tool' })
    tracer.failSpan(span.id, 'permission denied')

    expect(tracer.summarizeRun(run.id).errors).toBe(1)
  })
})
