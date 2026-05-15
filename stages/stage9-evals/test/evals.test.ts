import { describe, expect, it } from 'vitest'
import { RuleBasedEvaluator, ToolCallingEvaluator } from '../src/index.js'

describe('stage9 evals', () => {
  it('fails when required terms are missing', () => {
    const evaluator = new RuleBasedEvaluator()
    const result = evaluator.evaluate(
      { content: 'TypeScript adds types to JavaScript.' },
      { contains: ['TypeScript', 'Python'] }
    )

    expect(result.passed).toBe(false)
    expect(result.score).toBeLessThan(1)
    expect(result.details).toContain('Python')
  })

  it('evaluates expected tool calls from expected.tools', () => {
    const evaluator = new ToolCallingEvaluator()
    const result = evaluator.evaluate(
      [{ tool: 'file_read', params: { path: 'README.md' }, success: true }],
      ['file_read', 'search']
    )

    expect(result.recall).toBe(0.5)
    expect(result.missedTools).toEqual(['search'])
  })
})
