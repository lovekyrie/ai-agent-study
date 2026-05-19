export type WorkflowState = 'pending' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled'

export interface WorkflowNode {
  id: string
  type: 'supervisor' | 'specialist' | 'approval' | 'end'
  name: string
  description: string
  agent?: AgentConfig
  next?: string | ((ctx: WorkflowContext) => string)
}

export interface AgentConfig {
  name: string
  role: string
  instructions: string
  tools?: string[]
}

export interface WorkflowEdge {
  from: string
  to: string
  condition?: (ctx: WorkflowContext) => boolean
}

export interface WorkflowContext {
  workflowId: string
  state: WorkflowState
  currentNode: string
  data: Record<string, unknown>
  history: WorkflowHistoryEntry[]
  checkpoints: Map<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface WorkflowHistoryEntry {
  nodeId: string
  action: string
  input: unknown
  output: unknown
  timestamp: Date
}

export interface Checkpoint {
  id: string
  nodeId: string
  state: WorkflowState
  data: Record<string, unknown>
  timestamp: Date
}

export interface AgentExecutionResult {
  success: boolean
  output: unknown
  handoff?: HandoffRequest
}

export interface HandoffRequest {
  to: string
  reason: string
  context: Record<string, unknown>
}

export interface AgentExecutor {
  execute(context: WorkflowContext): Promise<AgentExecutionResult>
}
