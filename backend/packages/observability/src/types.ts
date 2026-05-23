export type SpanKind = 'llm' | 'tool' | 'retrieval' | 'workflow' | 'server' | 'eval'
export type SpanStatus = 'running' | 'ok' | 'error'

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCost?: number
}

export interface TraceSpan {
  id: string
  runId: string
  parentId?: string
  name: string
  kind: SpanKind
  status: SpanStatus
  startedAt: number
  endedAt?: number
  durationMs?: number
  attributes: Record<string, unknown>
  input?: unknown
  output?: unknown
  error?: string
  usage?: TokenUsage
}

export interface AgentRun {
  id: string
  name: string
  status: SpanStatus
  startedAt: number
  endedAt?: number
  durationMs?: number
  input?: unknown
  output?: unknown
  error?: string
  spans: TraceSpan[]
}

export interface EvalCase {
  id: string
  name: string
  category: string
  input: unknown
  expected?: unknown
  metadata: Record<string, unknown>
}
