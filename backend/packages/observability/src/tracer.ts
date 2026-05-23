import type { AgentRun, EvalCase, SpanKind, TokenUsage, TraceSpan } from './types.js'

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export class InMemoryTracer {
  private readonly runs = new Map<string, AgentRun>()
  private readonly spans = new Map<string, TraceSpan>()

  startRun(name: string, input?: unknown): AgentRun {
    const run: AgentRun = {
      id: id('run'),
      name,
      status: 'running',
      startedAt: Date.now(),
      input,
      spans: [],
    }
    this.runs.set(run.id, run)
    return run
  }

  finishRun(runId: string, output?: unknown): AgentRun {
    const run = this.requireRun(runId)
    run.status = 'ok'
    run.output = output
    run.endedAt = Date.now()
    run.durationMs = run.endedAt - run.startedAt
    return run
  }

  failRun(runId: string, error: Error | string): AgentRun {
    const run = this.requireRun(runId)
    run.status = 'error'
    run.error = error instanceof Error ? error.message : error
    run.endedAt = Date.now()
    run.durationMs = run.endedAt - run.startedAt
    return run
  }

  startSpan(params: {
    runId: string
    parentId?: string
    name: string
    kind: SpanKind
    input?: unknown
    attributes?: Record<string, unknown>
  }): TraceSpan {
    const run = this.requireRun(params.runId)
    const span: TraceSpan = {
      id: id('span'),
      runId: params.runId,
      parentId: params.parentId,
      name: params.name,
      kind: params.kind,
      status: 'running',
      startedAt: Date.now(),
      input: params.input,
      attributes: params.attributes ?? {},
    }
    run.spans.push(span)
    this.spans.set(span.id, span)
    return span
  }

  endSpan(spanId: string, output?: unknown, usage?: TokenUsage): TraceSpan {
    const span = this.requireSpan(spanId)
    span.status = 'ok'
    span.output = output
    span.usage = usage
    span.endedAt = Date.now()
    span.durationMs = span.endedAt - span.startedAt
    return span
  }

  failSpan(spanId: string, error: Error | string): TraceSpan {
    const span = this.requireSpan(spanId)
    span.status = 'error'
    span.error = error instanceof Error ? error.message : error
    span.endedAt = Date.now()
    span.durationMs = span.endedAt - span.startedAt
    return span
  }

  getRun(runId: string): AgentRun | undefined {
    return this.runs.get(runId)
  }

  listRuns(): AgentRun[] {
    return Array.from(this.runs.values())
  }

  summarizeRun(runId: string) {
    const run = this.requireRun(runId)
    const usage = run.spans.reduce(
      (acc, span) => {
        acc.inputTokens += span.usage?.inputTokens ?? 0
        acc.outputTokens += span.usage?.outputTokens ?? 0
        acc.totalTokens += span.usage?.totalTokens ?? 0
        acc.estimatedCost += span.usage?.estimatedCost ?? 0
        return acc
      },
      { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: 0 },
    )

    return {
      runId: run.id,
      status: run.status,
      durationMs: run.durationMs ?? 0,
      spans: run.spans.length,
      errors: run.spans.filter(span => span.status === 'error').length + (run.status === 'error' ? 1 : 0),
      usage,
    }
  }

  toEvalCases(category = 'trace'): EvalCase[] {
    return this.listRuns()
      .filter(run => run.input !== undefined && run.output !== undefined)
      .map(run => ({
        id: `eval-${run.id}`,
        name: run.name,
        category,
        input: run.input,
        expected: run.output,
        metadata: {
          traceRunId: run.id,
          spanCount: run.spans.length,
          durationMs: run.durationMs ?? 0,
        },
      }))
  }

  private requireRun(runId: string): AgentRun {
    const run = this.runs.get(runId)
    if (!run)
      throw new Error(`Run ${runId} not found`)
    return run
  }

  private requireSpan(spanId: string): TraceSpan {
    const span = this.spans.get(spanId)
    if (!span)
      throw new Error(`Span ${spanId} not found`)
    return span
  }
}
