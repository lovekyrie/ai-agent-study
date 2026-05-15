export interface EvalCase {
  id: string
  name: string
  category: 'rag' | 'tool_calling' | 'agent' | 'general'
  input: EvalInput
  expected: EvalExpected
  metadata?: Record<string, unknown>
}

export interface EvalInput {
  query?: string
  messages?: { role: string; content: string }[]
  context?: Record<string, unknown>
}

export interface EvalExpected {
  contains?: string[]
  pattern?: RegExp
  minScore?: number
  tools?: string[]
  custom?: (output: EvalOutput, expected: EvalExpected) => boolean
}

export interface EvalOutput {
  content: string
  metadata?: Record<string, unknown>
  latencyMs?: number
  cost?: number
  toolCalls?: ToolCall[]
}

export interface ToolCall {
  tool: string
  params: Record<string, unknown>
  result?: unknown
  success?: boolean
}

export interface EvalResult {
  caseId: string
  passed: boolean
  score: number
  details: string
  output: EvalOutput
  latencyMs: number
  cost: number
}

export interface EvalSuite {
  name: string
  cases: EvalCase[]
  results: EvalResult[]
  summary: EvalSummary
  timestamp: Date
}

export interface EvalSummary {
  total: number
  passed: number
  failed: number
  passRate: number
  avgLatencyMs: number
  totalCost: number
  categoryBreakdown: Record<string, { total: number; passed: number; passRate: number }>
}

export class GoldenDataset {
  private cases: Map<string, EvalCase> = new Map()

  add(case_: EvalCase): void {
    this.cases.set(case_.id, case_)
  }

  get(id: string): EvalCase | undefined {
    return this.cases.get(id)
  }

  list(): EvalCase[] {
    return Array.from(this.cases.values())
  }

  listByCategory(category: EvalCase['category']): EvalCase[] {
    return this.list().filter(c => c.category === category)
  }

  size(): number {
    return this.cases.size
  }
}

export class RuleBasedEvaluator {
  evaluate(output: EvalOutput, expected: EvalExpected): { passed: boolean; score: number; details: string } {
    let score = 1.0
    const reasons: string[] = []
    let hardFailure = false

    if (expected.contains) {
      const found = expected.contains.filter(term =>
        output.content.toLowerCase().includes(term.toLowerCase())
      )
      const missing = expected.contains.filter(term => !found.includes(term))
      if (missing.length === 0) {
        reasons.push('All required terms found')
      } else {
        const ratio = expected.contains.length > 0 ? found.length / expected.contains.length : 1
        score = Math.min(score, ratio)
        hardFailure = true
        reasons.push(`Missing required terms: ${missing.join(', ')}`)
      }
    }

    if (expected.pattern) {
      if (expected.pattern.test(output.content)) {
        reasons.push('Pattern matched')
      } else {
        score -= 0.5
        hardFailure = true
        reasons.push('Pattern not matched')
      }
    }

    if (expected.minScore !== undefined && output.metadata?.score !== undefined) {
      const scoreVal = typeof output.metadata.score === 'number' ? output.metadata.score : 0
      if (scoreVal >= expected.minScore) {
        reasons.push(`Score ${scoreVal} >= ${expected.minScore}`)
      } else {
        score -= (expected.minScore - scoreVal)
        hardFailure = true
        reasons.push(`Score ${scoreVal} < ${expected.minScore}`)
      }
    }

    if (expected.custom) {
      const customResult = expected.custom(output, expected)
      if (customResult) {
        reasons.push('Custom validation passed')
      } else {
        score = 0
        hardFailure = true
        reasons.push('Custom validation failed')
      }
    }

    const normalizedScore = Math.max(0, Math.min(1, score))
    const passed = !hardFailure && normalizedScore >= 0.5
    return {
      passed,
      score: normalizedScore,
      details: reasons.join('; ') || 'No specific checks',
    }
  }
}

export interface LLMJudgeConfig {
  model?: string
  temperature?: number
}

export class LLMJudge {
  private client = createLLMClient()
  private config: LLMJudgeConfig

  constructor(config: LLMJudgeConfig = {}) {
    this.config = { temperature: 0, ...config }
  }

  async judge(
    question: string,
    answer: string,
    criteria: string = 'Is the answer helpful, accurate, and relevant to the question?'
  ): Promise<{ score: number; reasoning: string }> {
    const prompt = `You are an expert evaluator. Judge the following answer based on the given criteria.

Question: ${question}

Answer: ${answer}

Criteria: ${criteria}

Provide your evaluation in JSON format:
{
  "score": <number 0-1>,
  "reasoning": "<brief explanation>"
}`

    try {
      const response = await this.client.chat([
        { role: 'system', content: 'You are a fair and strict evaluator. Respond only with valid JSON.' },
        { role: 'user', content: prompt },
      ], { jsonMode: true, temperature: this.config.temperature ?? 0, maxTokens: 500 })

      const parsed = this.parseJSON(response.content)
      const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning provided'
      return {
        score: clampScore(parsed.score),
        reasoning,
      }
    } catch (error) {
      return {
        score: 0,
        reasoning: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  async judgeRAG(
    question: string,
    answer: string,
    contexts: string[]
  ): Promise<RAGMetrics> {
    const prompt = `You are a RAG evaluation expert. Evaluate the following RAG system output.

Question: ${question}

Retrieved Contexts:
${contexts.map((ctx, i) => `${i + 1}. ${ctx}`).join('\n')}

Answer: ${answer}

Evaluate these metrics (0-1 scale):
1. Faithfulness: How well does the answer stick to the retrieved contexts without hallucination?
2. Answer Relevance: How relevant and helpful is the answer to the question?
3. Context Precision: How precisely are the relevant contexts ranked/retrieved?
4. Context Recall: How many of the needed contexts were retrieved?

Provide JSON:
{
  "faithfulness": <number>,
  "answerRelevance": <number>,
  "contextPrecision": <number>,
  "contextRecall": <number>
}`

    try {
      const response = await this.client.chat([
        { role: 'system', content: 'You are a RAG evaluation expert. Respond only with valid JSON.' },
        { role: 'user', content: prompt },
      ], { jsonMode: true, temperature: this.config.temperature ?? 0, maxTokens: 700 })

      const parsed = this.parseJSON(response.content)
      return {
        faithfulness: clampScore(parsed.faithfulness),
        answerRelevance: clampScore(parsed.answerRelevance),
        contextPrecision: clampScore(parsed.contextPrecision),
        contextRecall: clampScore(parsed.contextRecall),
      }
    } catch (error) {
      return {
        faithfulness: 0,
        answerRelevance: 0,
        contextPrecision: 0,
        contextRecall: 0,
      }
    }
  }

  private parseJSON(content: string): Record<string, unknown> {
    const match = content.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>
      } catch {
        return {}
      }
    }
    return {}
  }
}

export interface RAGMetrics {
  faithfulness: number
  answerRelevance: number
  contextPrecision: number
  contextRecall: number
}

export class ToolCallingEvaluator {
  evaluate(toolCalls: ToolCall[], expectedTools: string[]): ToolCallingEvalResult {
    const expectedSet = new Set(expectedTools)
    const calledSet = new Set(toolCalls.map(t => t.tool))

    const correctCalls = toolCalls.filter(t =>
      expectedSet.has(t.tool) && t.success !== false
    )
    const missedTools = expectedTools.filter(t => !calledSet.has(t))
    const extraTools = toolCalls.map(t => t.tool).filter(t => !expectedSet.has(t))

    const precision = toolCalls.length > 0
      ? correctCalls.length / toolCalls.length
      : expectedTools.length === 0 ? 1 : 0
    const recall = expectedTools.length > 0
      ? correctCalls.length / expectedTools.length
      : 1

    const f1 = precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0

    return {
      precision,
      recall,
      f1,
      correctCalls: correctCalls.length,
      missedTools,
      extraTools,
      toolCalls,
    }
  }
}

export interface ToolCallingEvalResult {
  precision: number
  recall: number
  f1: number
  correctCalls: number
  missedTools: string[]
  extraTools: string[]
  toolCalls: ToolCall[]
}

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
      } catch (error) {
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
    } else {
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

    const categoryBreakdown: Record<string, { total: number; passed: number; passRate: number }> = {}

    const byCategory = new Map<string, EvalResult[]>()
    for (const result of results) {
      const testCase = this.goldenDataset.get(result.caseId)
      if (testCase) {
        const cat = testCase.category
        if (!byCategory.has(cat)) byCategory.set(cat, [])
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

export interface RunOptions {
  category?: EvalCase['category']
  runFn?: (testCase: EvalCase) => Promise<{ content: string; metadata?: Record<string, unknown>; toolCalls?: ToolCall[] }>
  useLLMJudge?: boolean
}

export class RegressionTracker {
  private history: EvalSuite[] = []

  add(suite: EvalSuite): void {
    this.history.push(suite)
  }

  getHistory(): EvalSuite[] {
    return [...this.history]
  }

  getLatest(): EvalSuite | undefined {
    return this.history[this.history.length - 1]
  }

  compare(baseline: EvalSuite, current: EvalSuite): RegressionReport {
    const delta = {
      passRate: current.summary.passRate - baseline.summary.passRate,
      avgLatency: current.summary.avgLatencyMs - baseline.summary.avgLatencyMs,
      cost: current.summary.totalCost - baseline.summary.totalCost,
    }

    const regressions: string[] = []
    if (delta.passRate < -0.1) regressions.push('Pass rate dropped significantly')
    if (delta.avgLatency > 1000) regressions.push('Latency increased by >1s')

    return {
      baseline: baseline.timestamp,
      current: current.timestamp,
      delta,
      hasRegression: delta.passRate < -0.05 || regressions.length > 0,
      regressions,
    }
  }
}

export interface RegressionReport {
  baseline: Date
  current: Date
  delta: {
    passRate: number
    avgLatency: number
    cost: number
  }
  hasRegression: boolean
  regressions: string[]
}

export class CostTracker {
  private requests: { timestamp: Date; inputTokens: number; outputTokens: number; model: string }[] = []

  record(inputTokens: number, outputTokens: number, model: string): void {
    this.requests.push({ timestamp: new Date(), inputTokens, outputTokens, model })
  }

  getTotal(): { inputTokens: number; outputTokens: number; estimatedCost: number } {
    const totals = this.requests.reduce(
      (acc, r) => ({
        inputTokens: acc.inputTokens + r.inputTokens,
        outputTokens: acc.outputTokens + r.outputTokens,
      }),
      { inputTokens: 0, outputTokens: 0 }
    )

    return {
      ...totals,
      estimatedCost: this.calculateCost(totals.inputTokens, totals.outputTokens),
    }
  }

  getByModel(): Record<string, { requests: number; inputTokens: number; outputTokens: number; cost: number }> {
    const byModel: Record<string, { requests: number; inputTokens: number; outputTokens: number; cost: number }> = {}

    for (const req of this.requests) {
      if (!byModel[req.model]) {
        byModel[req.model] = { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 }
      }
      byModel[req.model].requests++
      byModel[req.model].inputTokens += req.inputTokens
      byModel[req.model].outputTokens += req.outputTokens
      byModel[req.model].cost += this.calculateCost(req.inputTokens, req.outputTokens)
    }

    return byModel
  }

  private calculateCost(inputTokens: number, outputTokens: number): number {
    const INPUT_COST_PER_1K = 0.00015
    const OUTPUT_COST_PER_1K = 0.0006
    return (inputTokens / 1000) * INPUT_COST_PER_1K + (outputTokens / 1000) * OUTPUT_COST_PER_1K
  }
}

function clampScore(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0
}
import { createLLMClient } from '@ai-agent-study/llm-client'
