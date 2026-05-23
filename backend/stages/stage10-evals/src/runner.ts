import type { GoldenDataset } from './dataset.js'
import type {
  EvalCase,
  EvalOutput,
  EvalResult,
  EvalSuite,
  LLMJudgeConfig,
  RunOptions,
} from './types.js'
import { LLMJudge, RuleBasedEvaluator, ToolCallingEvaluator } from './evaluators.js'

export class EvalRunner {
  private goldenDataset: GoldenDataset
  private ruleEvaluator = new RuleBasedEvaluator()
  private llmJudge?: LLMJudge
  private toolEvaluator = new ToolCallingEvaluator()

  constructor(dataset: GoldenDataset, judgeConfig?: LLMJudgeConfig) {
    this.goldenDataset = dataset
    if (judgeConfig) {
      this.llmJudge = new LLMJudge(judgeConfig)
    }
  }

  async runAll(options: RunOptions = {}): Promise<EvalSuite> {
    const cases = options.category
      ? this.goldenDataset.listByCategory(options.category)
      : this.goldenDataset.list()

    const results: EvalResult[] = []

    for (const testCase of cases) {
      const result = await this.runCase(testCase, options)
      results.push(result)
    }

    return this.buildSuite(results)
  }

  async runCase(testCase: EvalCase, options: RunOptions = {}): Promise<EvalResult> {
    const startTime = Date.now()

    const output: EvalOutput = {
      content: '',
      metadata: {},
      latencyMs: 0,
      cost: 0,
      toolCalls: [],
    }

    if (options.runFn) {
      try {
        const result = await options.runFn(testCase)
        output.content = result.content
        output.metadata = result.metadata
        output.toolCalls = result.toolCalls
      }
      catch (error) {
        output.content = `Error: ${error instanceof Error ? error.message : String(error)}`
      }
    }

    output.latencyMs = Date.now() - startTime
    output.cost = this.estimateCost(output.content)

    let passed = false
    let score = 0
    let details = ''

    if (testCase.category === 'tool_calling' && output.toolCalls) {
      const expectedTools = testCase.expected.tools || []
      const toolResult = this.toolEvaluator.evaluate(output.toolCalls, expectedTools)
      passed = toolResult.f1 >= 0.8
      score = toolResult.f1
      details = `Tool F1: ${toolResult.f1.toFixed(2)}, Missed: ${toolResult.missedTools.join(', ') || 'none'}`
    }
    else {
      const ruleResult = this.ruleEvaluator.evaluate(output, testCase.expected)
      passed = ruleResult.passed
      score = ruleResult.score
      details = ruleResult.details
    }

    if (options.useLLMJudge && this.llmJudge && testCase.input.query) {
      const llmResult = await this.llmJudge.judge(testCase.input.query, output.content)
      score = (score + llmResult.score) / 2
      details += ` | LLM Judge: ${llmResult.reasoning}`
      passed = score >= 0.5
    }

    return {
      caseId: testCase.id,
      passed,
      score,
      details,
      output,
      latencyMs: output.latencyMs,
      cost: output.cost,
    }
  }

  private buildSuite(results: EvalResult[]): EvalSuite {
    const total = results.length
    const passed = results.filter(r => r.passed).length
    const failed = total - passed
    const totalLatency = results.reduce((sum, r) => sum + r.latencyMs, 0)
    const totalCost = results.reduce((sum, r) => sum + r.cost, 0)

    const categoryBreakdown: Record<string, { total: number, passed: number, passRate: number }> = {}

    const byCategory = new Map<string, EvalResult[]>()
    for (const result of results) {
      const testCase = this.goldenDataset.get(result.caseId)
      if (testCase) {
        const cat = testCase.category
        if (!byCategory.has(cat))
          byCategory.set(cat, [])
        byCategory.get(cat)!.push(result)
      }
    }

    for (const [cat, catResults] of byCategory) {
      const catTotal = catResults.length
      const catPassed = catResults.filter(r => r.passed).length
      categoryBreakdown[cat] = {
        total: catTotal,
        passed: catPassed,
        passRate: catTotal > 0 ? catPassed / catTotal : 0,
      }
    }

    return {
      name: 'Eval Suite',
      cases: this.goldenDataset.list(),
      results,
      summary: {
        total,
        passed,
        failed,
        passRate: total > 0 ? passed / total : 0,
        avgLatencyMs: total > 0 ? totalLatency / total : 0,
        totalCost,
        categoryBreakdown,
      },
      timestamp: new Date(),
    }
  }

  private estimateCost(content: string): number {
    const tokens = content.length / 4
    return tokens * 0.00001
  }
}
