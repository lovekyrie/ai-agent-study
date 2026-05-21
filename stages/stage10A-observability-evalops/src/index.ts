import { InMemoryTracer, type EvalCase } from '@ai-agent-study/observability'

export interface RegressionGateInput {
  baselinePassRate: number
  currentPassRate: number
  minPassRate?: number
  maxDrop?: number
}

export function evaluateRegression(input: RegressionGateInput) {
  const minPassRate = input.minPassRate ?? 0.8
  const maxDrop = input.maxDrop ?? 0.05
  const drop = input.baselinePassRate - input.currentPassRate
  const passed = input.currentPassRate >= minPassRate && drop <= maxDrop
  return {
    passed,
    drop,
    reasons: [
      input.currentPassRate < minPassRate ? `pass rate below ${minPassRate}` : undefined,
      drop > maxDrop ? `pass rate dropped by ${drop.toFixed(3)}` : undefined,
    ].filter((reason): reason is string => Boolean(reason)),
  }
}

export async function runObservedAnswer(query: string, answerFn: (query: string) => Promise<string>) {
  const tracer = new InMemoryTracer()
  const run = tracer.startRun('observed-answer', { query })
  const span = tracer.startSpan({ runId: run.id, name: 'llm.answer', kind: 'llm', input: { query } })
  try {
    const answer = await answerFn(query)
    tracer.endSpan(span.id, { answer }, { inputTokens: query.length, outputTokens: answer.length, totalTokens: query.length + answer.length })
    tracer.finishRun(run.id, { answer })
  } catch (error) {
    tracer.failSpan(span.id, error instanceof Error ? error : String(error))
    tracer.failRun(run.id, error instanceof Error ? error : String(error))
  }
  return { tracer, run: tracer.getRun(run.id), evalCases: tracer.toEvalCases('observed-answer') as EvalCase[] }
}
