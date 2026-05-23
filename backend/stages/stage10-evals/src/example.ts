import type { ToolCall } from './index.js'
import {
  CostTracker,
  EvalRunner,
  GoldenDataset,
  LLMJudge,
  RegressionTracker,
  RuleBasedEvaluator,

  ToolCallingEvaluator,
} from './index.js'

async function goldenDatasetDemo() {
  console.log('=== Golden Dataset Demo ===\n')

  const dataset = new GoldenDataset()

  dataset.add({
    id: 'rag-001',
    name: 'Basic RAG Query',
    category: 'rag',
    input: { query: 'What is TypeScript?' },
    expected: {
      contains: ['TypeScript', 'JavaScript', 'typed'],
    },
  })

  dataset.add({
    id: 'rag-002',
    name: 'RAG with Score Threshold',
    category: 'rag',
    input: { query: 'Explain async/await' },
    expected: {
      contains: ['async', 'await', 'promise'],
      minScore: 0.7,
    },
  })

  dataset.add({
    id: 'tool-001',
    name: 'Tool Calling Test',
    category: 'tool_calling',
    input: { query: 'Call file_read' },
    expected: { tools: ['file_read'] },
  })

  console.log('Total cases:', dataset.size())
  console.log('RAG cases:', dataset.listByCategory('rag').length)
  console.log('Tool calling cases:', dataset.listByCategory('tool_calling').length)
}

async function ruleEvaluatorDemo() {
  console.log('\n=== Rule-Based Evaluator Demo ===\n')

  const evaluator = new RuleBasedEvaluator()

  const result1 = evaluator.evaluate(
    { content: 'TypeScript is a typed superset of JavaScript.' },
    { contains: ['TypeScript', 'JavaScript'] },
  )
  console.log('Test 1 (all terms found):', result1)

  const result2 = evaluator.evaluate(
    { content: 'TypeScript adds types to JavaScript.' },
    { contains: ['TypeScript', 'Python', 'Java'] },
  )
  console.log('Test 2 (some terms missing):', result2)

  const result3 = evaluator.evaluate(
    { content: 'TS is a typed superset of JS.' },
    { pattern: /typescript/i },
  )
  console.log('Test 3 (pattern match):', result3)
}

async function toolCallingEvaluatorDemo() {
  console.log('\n=== Tool Calling Evaluator Demo ===\n')

  const evaluator = new ToolCallingEvaluator()

  const toolCalls: ToolCall[] = [
    { tool: 'file_read', params: { path: 'package.json' }, success: true },
    { tool: 'http_request', params: { url: 'https://api.example.com' }, success: true },
    { tool: 'file_write', params: { path: 'output.txt' }, success: false },
  ]

  const result = evaluator.evaluate(toolCalls, ['file_read', 'http_request'])
  console.log('Tool calling evaluation:')
  console.log('- Precision:', result.precision.toFixed(2))
  console.log('- Recall:', result.recall.toFixed(2))
  console.log('- F1:', result.f1.toFixed(2))
  console.log('- Missed tools:', result.missedTools.join(', ') || 'none')
  console.log('- Extra tools:', result.extraTools.join(', ') || 'none')
}

async function llmJudgeDemo() {
  console.log('\n=== LLM Judge Demo ===\n')

  const judge = new LLMJudge()

  const result = await judge.judge(
    'What is TypeScript?',
    'TypeScript is a programming language that extends JavaScript with static typing. It was developed by Microsoft.',
    'Evaluate accuracy and relevance',
  )

  console.log('LLM Judge result:')
  console.log('- Score:', result.score.toFixed(2))
  console.log('- Reasoning:', result.reasoning)
}

async function ragMetricsDemo() {
  console.log('\n=== RAG Metrics Demo ===\n')

  const judge = new LLMJudge()

  const metrics = await judge.judgeRAG(
    'What is TypeScript?',
    'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.',
    [
      'TypeScript is a language that extends JavaScript with type annotations.',
      'It provides compile-time type checking and modern JavaScript features.',
    ],
  )

  console.log('RAG Metrics:')
  console.log('- Faithfulness:', metrics.faithfulness.toFixed(2))
  console.log('- Answer Relevance:', metrics.answerRelevance.toFixed(2))
  console.log('- Context Precision:', metrics.contextPrecision.toFixed(2))
  console.log('- Context Recall:', metrics.contextRecall.toFixed(2))
}

async function evalRunnerDemo() {
  console.log('\n=== Eval Runner Demo ===\n')

  const dataset = new GoldenDataset()

  dataset.add({
    id: 'test-001',
    name: 'Simple Test',
    category: 'general',
    input: { query: 'Say hello' },
    expected: { contains: ['hello'] },
  })

  const runner = new EvalRunner(dataset)

  const suite = await runner.runAll({
    runFn: async (testCase) => {
      return {
        content: 'Hello! How can I help you?',
        metadata: {},
      }
    },
  })

  console.log('Eval Suite Results:')
  console.log('- Total:', suite.summary.total)
  console.log('- Passed:', suite.summary.passed)
  console.log('- Failed:', suite.summary.failed)
  console.log('- Pass Rate:', `${(suite.summary.passRate * 100).toFixed(1)}%`)
  console.log('- Avg Latency:', `${suite.summary.avgLatencyMs.toFixed(0)}ms`)
}

async function regressionTrackerDemo() {
  console.log('\n=== Regression Tracker Demo ===\n')

  const tracker = new RegressionTracker()

  const baselineSuite = {
    name: 'Baseline',
    cases: [],
    results: [],
    summary: {
      total: 10,
      passed: 8,
      failed: 2,
      passRate: 0.8,
      avgLatencyMs: 100,
      totalCost: 0.05,
      categoryBreakdown: {},
    },
    timestamp: new Date(Date.now() - 86400000),
  }

  const currentSuite = {
    name: 'Current',
    cases: [],
    results: [],
    summary: {
      total: 10,
      passed: 6,
      failed: 4,
      passRate: 0.6,
      avgLatencyMs: 150,
      totalCost: 0.07,
      categoryBreakdown: {},
    },
    timestamp: new Date(),
  }

  tracker.add(baselineSuite)
  tracker.add(currentSuite)

  const report = tracker.compare(baselineSuite, currentSuite)

  console.log('Regression Report:')
  console.log('- Has Regression:', report.hasRegression)
  console.log('- Pass Rate Delta:', `${(report.delta.passRate * 100).toFixed(1)}%`)
  console.log('- Latency Delta:', `${report.delta.avgLatency.toFixed(0)}ms`)
  console.log('- Regressions:', report.regressions.join(', ') || 'none')
}

async function costTrackerDemo() {
  console.log('\n=== Cost Tracker Demo ===\n')

  const tracker = new CostTracker()

  tracker.record(1000, 500, 'gpt-4o')
  tracker.record(800, 300, 'gpt-4o-mini')
  tracker.record(1200, 600, 'gpt-4o')

  const total = tracker.getTotal()
  console.log('Total usage:')
  console.log('- Input tokens:', total.inputTokens)
  console.log('- Output tokens:', total.outputTokens)
  console.log(`- Estimated cost: $${total.estimatedCost.toFixed(4)}`)

  const byModel = tracker.getByModel()
  console.log('\nBy model:')
  for (const [model, stats] of Object.entries(byModel)) {
    console.log(`- ${model}: ${stats.requests} requests, $${stats.cost.toFixed(4)}`)
  }
}

async function main() {
  try {
    await goldenDatasetDemo()
    await ruleEvaluatorDemo()
    await toolCallingEvaluatorDemo()
    await llmJudgeDemo()
    await ragMetricsDemo()
    await evalRunnerDemo()
    await regressionTrackerDemo()
    await costTrackerDemo()
    console.log('\n=== Demo Complete ===')
  }
  catch (error) {
    console.error('Demo failed:', error)
  }
}

main().catch(console.error)
