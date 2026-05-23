import type { EvalCase, EvalSuite } from '../src/index.js'
import { describe, expect, it, vi } from 'vitest'
import {
  clampScore,
  CostTracker,
  EvalRunner,
  GoldenDataset,
  RegressionTracker,
  RuleBasedEvaluator,
  ToolCallingEvaluator,
} from '../src/index.js'

vi.mock('@ai-agent-study/llm-client', () => ({
  createLLMClient: () => ({
    chat: vi.fn().mockResolvedValue({ content: '{"score":0.8,"reasoning":"ok"}', role: 'assistant' }),
  }),
}))

/* ─────── RuleBasedEvaluator ─────── */
describe('ruleBasedEvaluator', () => {
  const evaluator = new RuleBasedEvaluator()

  it('passes when all required terms found', () => {
    const r = evaluator.evaluate(
      { content: 'TypeScript is a typed superset of JavaScript' },
      { contains: ['TypeScript', 'JavaScript'] },
    )
    expect(r.passed).toBe(true)
    expect(r.score).toBe(1)
  })

  it('fails when required terms missing', () => {
    const r = evaluator.evaluate(
      { content: 'TypeScript adds types to JavaScript.' },
      { contains: ['TypeScript', 'Python'] },
    )
    expect(r.passed).toBe(false)
    expect(r.score).toBeLessThan(1)
    expect(r.details).toContain('Python')
  })

  it('checks regex pattern', () => {
    const r = evaluator.evaluate(
      { content: 'The answer is 42.' },
      { pattern: /\d+/ },
    )
    expect(r.passed).toBe(true)
  })

  it('fails on pattern mismatch', () => {
    const r = evaluator.evaluate(
      { content: 'No numbers here.' },
      { pattern: /\d+/ },
    )
    expect(r.passed).toBe(false)
  })

  it('supports custom validator', () => {
    const r = evaluator.evaluate(
      { content: 'hello world' },
      { custom: o => o.content.length > 5 },
    )
    expect(r.passed).toBe(true)
  })

  it('fails on custom validator rejection', () => {
    const r = evaluator.evaluate(
      { content: 'hi' },
      { custom: o => o.content.length > 5 },
    )
    expect(r.passed).toBe(false)
    expect(r.score).toBe(0)
  })

  it('reports no specific checks when no criteria', () => {
    const r = evaluator.evaluate({ content: 'anything' }, {})
    expect(r.passed).toBe(true)
    expect(r.details).toContain('No specific checks')
  })
})

/* ─────── ToolCallingEvaluator ─────── */
describe('toolCallingEvaluator', () => {
  const evaluator = new ToolCallingEvaluator()

  it('perfect score when all expected tools called', () => {
    const r = evaluator.evaluate(
      [
        { tool: 'file_read', params: {}, success: true },
        { tool: 'search', params: {}, success: true },
      ],
      ['file_read', 'search'],
    )
    expect(r.precision).toBe(1)
    expect(r.recall).toBe(1)
    expect(r.f1).toBe(1)
    expect(r.missedTools).toEqual([])
  })

  it('partial recall when some tools missed', () => {
    const r = evaluator.evaluate(
      [{ tool: 'file_read', params: { path: 'README.md' }, success: true }],
      ['file_read', 'search'],
    )
    expect(r.recall).toBe(0.5)
    expect(r.missedTools).toEqual(['search'])
  })

  it('detects extra tools', () => {
    const r = evaluator.evaluate(
      [
        { tool: 'file_read', params: {}, success: true },
        { tool: 'delete', params: {}, success: true },
      ],
      ['file_read'],
    )
    expect(r.extraTools).toEqual(['delete'])
    expect(r.precision).toBe(0.5)
  })

  it('handles empty expected and empty calls', () => {
    const r = evaluator.evaluate([], [])
    expect(r.precision).toBe(1)
    expect(r.recall).toBe(1)
    expect(r.f1).toBe(1)
  })
})

/* ─────── GoldenDataset ─────── */
describe('goldenDataset', () => {
  it('add, get, list, size', () => {
    const ds = new GoldenDataset()
    const c: EvalCase = {
      id: 'c1',
      name: 'Test',
      category: 'general',
      input: { query: 'hi' },
      expected: { contains: ['hello'] },
    }
    ds.add(c)
    expect(ds.size()).toBe(1)
    expect(ds.get('c1')).toEqual(c)
    expect(ds.list()).toHaveLength(1)
  })

  it('listByCategory filters correctly', () => {
    const ds = new GoldenDataset()
    ds.add({ id: '1', name: 'A', category: 'rag', input: {}, expected: {} })
    ds.add({ id: '2', name: 'B', category: 'general', input: {}, expected: {} })
    ds.add({ id: '3', name: 'C', category: 'rag', input: {}, expected: {} })
    expect(ds.listByCategory('rag')).toHaveLength(2)
    expect(ds.listByCategory('general')).toHaveLength(1)
  })
})

/* ─────── EvalRunner ─────── */
describe('evalRunner', () => {
  it('runs all cases with runFn and produces summary', async () => {
    const ds = new GoldenDataset()
    ds.add({ id: '1', name: 'A', category: 'general', input: { query: 'what is TS?' }, expected: { contains: ['typed'] } })
    ds.add({ id: '2', name: 'B', category: 'general', input: { query: 'hello' }, expected: { contains: ['world'] } })

    const runner = new EvalRunner(ds)
    const suite = await runner.runAll({
      runFn: async tc => ({ content: tc.id === '1' ? 'typed language' : 'no match' }),
    })

    expect(suite.summary.total).toBe(2)
    expect(suite.summary.passed).toBe(1)
    expect(suite.summary.failed).toBe(1)
    expect(suite.summary.passRate).toBe(0.5)
    expect(suite.summary.categoryBreakdown.general.total).toBe(2)
  })

  it('evaluates tool_calling category with ToolCallingEvaluator', async () => {
    const ds = new GoldenDataset()
    ds.add({
      id: 't1',
      name: 'Tool',
      category: 'tool_calling',
      input: { query: 'read file' },
      expected: { tools: ['file_read'] },
    })

    const runner = new EvalRunner(ds)
    const suite = await runner.runAll({
      runFn: async () => ({
        content: 'done',
        toolCalls: [{ tool: 'file_read', params: {}, success: true }],
      }),
    })

    expect(suite.results[0].passed).toBe(true)
    expect(suite.results[0].score).toBe(1)
  })
})

/* ─────── RegressionTracker ─────── */
describe('regressionTracker', () => {
  function makeSuite(passRate: number, latency: number, cost: number, ts: Date): EvalSuite {
    return {
      name: 'suite',
      cases: [],
      results: [],
      summary: { total: 10, passed: passRate * 10, failed: (1 - passRate) * 10, passRate, avgLatencyMs: latency, totalCost: cost, categoryBreakdown: {} },
      timestamp: ts,
    }
  }

  it('detects regression when pass rate drops', () => {
    const tracker = new RegressionTracker()
    const baseline = makeSuite(0.9, 100, 1, new Date('2024-01-01'))
    const current = makeSuite(0.7, 100, 1, new Date('2024-01-02'))
    tracker.add(baseline)
    tracker.add(current)

    const report = tracker.compare(baseline, current)
    expect(report.hasRegression).toBe(true)
    expect(report.regressions).toContain('Pass rate dropped significantly')
  })

  it('no regression when metrics stable', () => {
    const tracker = new RegressionTracker()
    const baseline = makeSuite(0.9, 100, 1, new Date('2024-01-01'))
    const current = makeSuite(0.9, 100, 1, new Date('2024-01-02'))

    const report = tracker.compare(baseline, current)
    expect(report.hasRegression).toBe(false)
  })

  it('getLatest returns last added', () => {
    const tracker = new RegressionTracker()
    expect(tracker.getLatest()).toBeUndefined()
    const s = makeSuite(1, 0, 0, new Date())
    tracker.add(s)
    expect(tracker.getLatest()).toBe(s)
  })
})

/* ─────── CostTracker ─────── */
describe('costTracker', () => {
  it('tracks total tokens and cost', () => {
    const ct = new CostTracker()
    ct.record(1000, 500, 'gpt-4')
    ct.record(2000, 1000, 'gpt-4')

    const total = ct.getTotal()
    expect(total.inputTokens).toBe(3000)
    expect(total.outputTokens).toBe(1500)
    expect(total.estimatedCost).toBeGreaterThan(0)
  })

  it('groups by model', () => {
    const ct = new CostTracker()
    ct.record(1000, 500, 'gpt-4')
    ct.record(2000, 1000, 'gpt-3.5')

    const byModel = ct.getByModel()
    expect(byModel['gpt-4'].requests).toBe(1)
    expect(byModel['gpt-3.5'].requests).toBe(1)
    expect(byModel['gpt-4'].inputTokens).toBe(1000)
  })
})

/* ─────── clampScore ─────── */
describe('clampScore', () => {
  it('clamps to 0-1 range', () => {
    expect(clampScore(1.5)).toBe(1)
    expect(clampScore(-0.5)).toBe(0)
    expect(clampScore(0.7)).toBe(0.7)
  })

  it('returns 0 for non-numeric values', () => {
    expect(clampScore('hello')).toBe(0)
    expect(clampScore(undefined)).toBe(0)
    expect(clampScore(Number.NaN)).toBe(0)
  })
})
