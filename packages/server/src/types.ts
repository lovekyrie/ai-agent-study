export type AgentStreamEvent
  = | { type: 'token', runId: string, delta: string }
    | { type: 'tool_call', runId: string, name: string, arguments: Record<string, unknown>, status: 'started' | 'completed' | 'failed', result?: unknown, error?: string }
    | { type: 'retrieval', runId: string, query: string, hits: number, sources: string[] }
    | { type: 'workflow_step', runId: string, nodeId: string, status: 'started' | 'completed' | 'waiting_approval' | 'failed', output?: unknown }
    | { type: 'final', runId: string, content: string, metadata?: Record<string, unknown> }
    | { type: 'error', runId: string, message: string, recoverable: boolean }

export interface RequestContext {
  requestId: string
  sessionId?: string
  userId?: string
  traceId?: string
}
