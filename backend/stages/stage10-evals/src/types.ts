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
  messages?: { role: string, content: string }[]
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
  categoryBreakdown: Record<string, { total: number, passed: number, passRate: number }>
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

export interface RAGMetrics {
  faithfulness: number
  answerRelevance: number
  contextPrecision: number
  contextRecall: number
}

export interface LLMJudgeConfig {
  model?: string
  temperature?: number
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

export interface RunOptions {
  category?: EvalCase['category']
  runFn?: (testCase: EvalCase) => Promise<{ content: string, metadata?: Record<string, unknown>, toolCalls?: ToolCall[] }>
  useLLMJudge?: boolean
}
