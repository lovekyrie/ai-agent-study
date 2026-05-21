import { describe, expect, it } from 'vitest'
import { evaluateRegression, runObservedAnswer } from '../src/index.js'

describe('stage10A observability evalops', () => {
  it('turns observed traces into eval cases', async () => {
    const result = await runObservedAnswer('hello', async () => 'world')
    expect(result.run?.status).toBe('ok')
    expect(result.evalCases).toHaveLength(1)
    expect(result.tracer.summarizeRun(result.run!.id).usage.totalTokens).toBeGreaterThan(0)
  })

  it('fails regression when pass rate drops too much', () => {
    const report = evaluateRegression({ baselinePassRate: 0.9, currentPassRate: 0.78 })
    expect(report.passed).toBe(false)
    expect(report.reasons.length).toBeGreaterThan(0)
  })
})
