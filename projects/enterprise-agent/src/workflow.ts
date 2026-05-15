import { EventEmitter } from 'events'
import { createLLMClient } from '@ai-agent-study/llm-client'

// Types
export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
export type TaskResult = {
  success: boolean
  output?: unknown
  error?: string
  comment?: string
  artifacts?: Record<string, unknown>
}

export interface Task {
  id: string
  name: string
  type: 'approval' | 'execution' | 'notification' | 'condition'
  description?: string
  assignTo?: string
  status: TaskStatus
  input?: Record<string, unknown>
  output?: TaskResult
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  requiresApproval: boolean
  approver?: string
  approvedBy?: string
  approvedAt?: Date
}

export interface WorkflowDefinition {
  id: string
  name: string
  description?: string
  version: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  initialContext: Record<string, unknown>
}

export interface WorkflowNode {
  id: string
  type: 'start' | 'end' | 'task' | 'approval' | 'condition' | 'parallel' | 'agent'
  name: string
  config: Record<string, unknown>
  next?: string
  branches?: { condition: string; next: string }[]
}

export interface WorkflowEdge {
  from: string
  to: string
  label?: string
}

export interface WorkflowInstance {
  id: string
  definitionId: string
  status: WorkflowStatus
  context: Record<string, unknown>
  tasks: Task[]
  currentNodeId?: string
  createdAt: Date
  updatedAt: Date
  completedAt?: Date
  error?: string
}

export interface AgentConfig {
  name: string
  role: string
  skills: string[]
  tools: string[]
}

const DEFAULT_AGENT_CONFIGS: Record<string, AgentConfig> = {
  supervisor: {
    name: 'Supervisor',
    role: 'Coordinates workflow execution and delegates tasks',
    skills: ['task decomposition', 'resource allocation', 'progress tracking'],
    tools: ['task_create', 'task_update', 'notification_send'],
  },
  reviewer: {
    name: 'Reviewer',
    role: 'Reviews and approves content or decisions',
    skills: ['code review', 'content review', 'decision making'],
    tools: ['approval_grant', 'approval_reject', 'comment_add'],
  },
  executor: {
    name: 'Executor',
    role: 'Executes assigned tasks',
    skills: ['code generation', 'data analysis', 'report writing'],
    tools: ['file_read', 'file_write', 'http_request', 'database_query'],
  },
  notifier: {
    name: 'Notifier',
    role: 'Sends notifications to stakeholders',
    skills: ['email composition', 'status updates', 'escalation'],
    tools: ['email_send', 'slack_message', 'webhook_trigger'],
  },
}

export class WorkflowOrchestrator extends EventEmitter {
  private llm = createLLMClient()
  private agents: Map<string, AgentConfig> = new Map()
  private workflows: Map<string, WorkflowDefinition> = new Map()
  private instances: Map<string, WorkflowInstance> = new Map()
  private taskHandlers: Map<string, (task: Task, context: Record<string, unknown>) => Promise<TaskResult>> = new Map()

  constructor() {
    super()
    // Register default agents
    for (const [id, config] of Object.entries(DEFAULT_AGENT_CONFIGS)) {
      this.agents.set(id, config)
    }
  }

  // Agent management
  registerAgent(id: string, config: AgentConfig): void {
    this.agents.set(id, config)
  }

  getAgent(id: string): AgentConfig | undefined {
    return this.agents.get(id)
  }

  listAgents(): AgentConfig[] {
    return Array.from(this.agents.values())
  }

  // Workflow management
  registerWorkflow(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow)
    this.emit('workflow-registered', workflow)
  }

  getWorkflow(id: string): WorkflowDefinition | undefined {
    return this.workflows.get(id)
  }

  async startWorkflow(workflowId: string, initialContext: Record<string, unknown> = {}): Promise<WorkflowInstance> {
    const workflow = this.workflows.get(workflowId)
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`)
    }

    const instanceId = `inst-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const instance: WorkflowInstance = {
      id: instanceId,
      definitionId: workflowId,
      status: 'running',
      context: { ...workflow.initialContext, ...initialContext },
      tasks: [],
      currentNodeId: workflow.nodes.find(n => n.type === 'start')?.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    this.instances.set(instanceId, instance)
    this.emit('workflow-started', instance)

    // Start execution asynchronously
    this.executeWorkflow(instanceId).catch(error => {
      this.emit('workflow-error', { instanceId, error: error.message })
    })

    return instance
  }

  private async executeWorkflow(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId)
    if (!instance) return

    const workflow = this.workflows.get(instance.definitionId)
    if (!workflow) {
      instance.status = 'failed'
      instance.error = 'Workflow definition not found'
      return
    }

    try {
      while (instance.status === 'running' && instance.currentNodeId) {
        const node = workflow.nodes.find(n => n.id === instance.currentNodeId)
        if (!node) {
          instance.status = 'failed'
          instance.error = `Node ${instance.currentNodeId} not found`
          break
        }

        this.emit('node-enter', { instanceId, nodeId: node.id, nodeType: node.type })

        const result = await this.executeNode(node, instance)

        if (!result.success) {
          instance.status = 'failed'
          instance.error = result.error
          break
        }

        instance.currentNodeId = result.nextNodeId
        instance.updatedAt = new Date()

        // Check if we've reached an end node
        if (instance.currentNodeId) {
          const nextNode = workflow.nodes.find(n => n.id === instance.currentNodeId)
          if (nextNode?.type === 'end') {
            instance.status = 'completed'
            instance.completedAt = new Date()
            this.emit('workflow-completed', instance)
            break
          }
        } else {
          // No next node, check if it's the end
          if (node.type === 'end') {
            instance.status = 'completed'
            instance.completedAt = new Date()
            this.emit('workflow-completed', instance)
          } else {
            instance.status = 'failed'
            instance.error = 'Workflow ended without end node'
          }
          break
        }
      }
    } catch (error) {
      instance.status = 'failed'
      instance.error = error instanceof Error ? error.message : String(error)
      this.emit('workflow-error', { instanceId, error: instance.error })
    }

    this.emit('workflow-ended', instance)
  }

  private async executeNode(node: WorkflowNode, instance: WorkflowInstance): Promise<{ success: boolean; nextNodeId?: string; error?: string }> {
    this.emit('node-execution-start', { instanceId: instance.id, nodeId: node.id })

    try {
      switch (node.type) {
        case 'start':
          return { success: true, nextNodeId: node.next }

        case 'end':
          return { success: true, nextNodeId: undefined }

        case 'task':
          return await this.executeTaskNode(node, instance)

        case 'approval':
          return await this.executeApprovalNode(node, instance)

        case 'condition':
          return await this.executeConditionNode(node, instance)

        case 'parallel':
          return await this.executeParallelNode(node, instance)

        case 'agent':
          return await this.executeAgentNode(node, instance)

        default:
          return { success: false, error: `Unknown node type: ${node.type}` }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  private async executeTaskNode(node: WorkflowNode, instance: WorkflowInstance): Promise<{ success: boolean; nextNodeId?: string; error?: string }> {
    const handler = this.taskHandlers.get(node.config.taskType as string)
    if (!handler) {
      return { success: false, error: `No handler for task type: ${node.config.taskType}` }
    }

    const task: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: node.name,
      type: 'execution',
      description: node.config.description as string,
      status: 'pending',
      requiresApproval: node.config.requiresApproval as boolean || false,
      createdAt: new Date(),
      input: node.config.input as Record<string, unknown>,
    }

    instance.tasks.push(task)
    task.status = 'in_progress'
    task.startedAt = new Date()

    this.emit('task-started', { instanceId: instance.id, task })

    const result = await handler(task, instance.context)

    task.status = result.success ? 'completed' : 'failed'
    task.output = result
    task.completedAt = new Date()

    // Store artifacts in context
    if (result.artifacts) {
      instance.context = { ...instance.context, ...result.artifacts }
    }

    this.emit('task-completed', { instanceId: instance.id, task, result })
    this.emit('node-execution-end', { instanceId: instance.id, nodeId: node.id, success: result.success })

    return { success: result.success, nextNodeId: node.next }
  }

  private async executeApprovalNode(node: WorkflowNode, instance: WorkflowInstance): Promise<{ success: boolean; nextNodeId?: string; error?: string }> {
    const task: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: node.name,
      type: 'approval',
      description: node.config.description as string,
      status: 'pending',
      requiresApproval: true,
      approver: node.config.approver as string,
      createdAt: new Date(),
      input: node.config.input as Record<string, unknown>,
    }

    instance.tasks.push(task)

    this.emit('approval-required', { instanceId: instance.id, task })

    // In a real system, this would wait for human approval
    // For demo, we'll auto-approve after a delay or use LLM to decide
    if (node.config.autoApprove) {
      task.status = 'completed'
      task.approvedBy = 'system'
      task.approvedAt = new Date()
      task.output = { success: true }
      task.completedAt = new Date()
      this.emit('task-completed', { instanceId: instance.id, task })
      return { success: true, nextNodeId: node.next }
    }

    // Placeholder - in production, this would block and wait for human
    return { success: true, nextNodeId: node.next }
  }

  private async executeConditionNode(node: WorkflowNode, instance: WorkflowInstance): Promise<{ success: boolean; nextNodeId?: string; error?: string }> {
    const condition = node.config.condition as string

    // Use LLM to evaluate the condition in context
    const prompt = `Evaluate this condition in the given context:

Condition: ${condition}

Context:
${JSON.stringify(instance.context, null, 2)}

Respond with JSON: { "result": true/false, "reasoning": "..." }`

    try {
      const response = await this.llm.chat([
        { role: 'user', content: prompt },
      ])

      const parsed = JSON.parse(response.content.replace(/[^}{]+$/, ''))
      const nextNodeId = parsed.result ? node.branches?.[0]?.next : node.branches?.[1]?.next

      this.emit('condition-evaluated', { instanceId: instance.id, nodeId: node.id, result: parsed.result })
      return { success: true, nextNodeId }
    } catch {
      return { success: false, error: 'Failed to evaluate condition' }
    }
  }

  private async executeParallelNode(node: WorkflowNode, instance: WorkflowInstance): Promise<{ success: boolean; nextNodeId?: string; error?: string }> {
    // Execute multiple branches in parallel
    const branchPromises = (node.branches || []).map(async branch => {
      const branchNodeId = branch.next
      if (!branchNodeId) return { success: false, error: 'No next node for branch' }

      const workflow = this.workflows.get(instance.definitionId)
      const branchNode = workflow?.nodes.find(n => n.id === branchNodeId)
      if (!branchNode) return { success: false, error: 'Branch node not found' }

      return this.executeNode(branchNode, instance)
    })

    const results = await Promise.all(branchPromises)
    const allSuccess = results.every(r => r.success)

    return { success: allSuccess, nextNodeId: node.next }
  }

  private async executeAgentNode(node: WorkflowNode, instance: WorkflowInstance): Promise<{ success: boolean; nextNodeId?: string; error?: string }> {
    const agentId = node.config.agentId as string
    const task = node.config.task as string
    const agent = this.agents.get(agentId)

    if (!agent) {
      return { success: false, error: `Agent ${agentId} not found` }
    }

    this.emit('agent-task-start', { instanceId: instance.id, agentId, task })

    // Build agent prompt
    const prompt = `You are ${agent.name}, a ${agent.role}.
Your task: ${task}

Current context:
${JSON.stringify(instance.context, null, 2)}

${node.config.systemPrompt ? `Additional instructions: ${node.config.systemPrompt}` : ''}

Provide your response as JSON:
{
  "success": true/false,
  "output": "your response/output",
  "artifacts": { "key": "value" }
}`

    try {
      const response = await this.llm.chat([
        { role: 'user', content: prompt },
      ])

      const parsed = JSON.parse(response.content.replace(/[^}{]+$/, ''))

      if (parsed.artifacts) {
        instance.context = { ...instance.context, ...parsed.artifacts }
      }

      this.emit('agent-task-complete', { instanceId: instance.id, agentId, success: parsed.success })
      return { success: parsed.success, nextNodeId: node.next }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  // Task handler registration
  registerTaskHandler(taskType: string, handler: (task: Task, context: Record<string, unknown>) => Promise<TaskResult>): void {
    this.taskHandlers.set(taskType, handler)
  }

  // Approval actions
  async approveTask(instanceId: string, taskId: string, approver: string, comment?: string): Promise<boolean> {
    const instance = this.instances.get(instanceId)
    if (!instance) return false

    const task = instance.tasks.find(t => t.id === taskId)
    if (!task || task.type !== 'approval') return false

    task.status = 'completed'
    task.approvedBy = approver
    task.approvedAt = new Date()
    task.output = { success: true, comment }
    task.completedAt = new Date()

    this.emit('task-approved', { instanceId, task, approver })
    return true
  }

  async rejectTask(instanceId: string, taskId: string, rejector: string, reason: string): Promise<boolean> {
    const instance = this.instances.get(instanceId)
    if (!instance) return false

    const task = instance.tasks.find(t => t.id === taskId)
    if (!task || task.type !== 'approval') return false

    task.status = 'failed'
    task.approvedBy = rejector
    task.approvedAt = new Date()
    task.output = { success: false, error: reason }
    task.completedAt = new Date()

    instance.status = 'failed'
    instance.error = `Task rejected: ${reason}`

    this.emit('task-rejected', { instanceId, task, rejector, reason })
    return true
  }

  // Instance management
  getInstance(id: string): WorkflowInstance | undefined {
    return this.instances.get(id)
  }

  listInstances(workflowId?: string): WorkflowInstance[] {
    const instances = Array.from(this.instances.values())
    if (workflowId) {
      return instances.filter(i => i.definitionId === workflowId)
    }
    return instances
  }

  async cancelInstance(id: string): Promise<boolean> {
    const instance = this.instances.get(id)
    if (!instance) return false

    instance.status = 'cancelled'
    instance.completedAt = new Date()
    this.emit('workflow-cancelled', instance)
    return true
  }

  // Context management
  updateContext(instanceId: string, updates: Record<string, unknown>): boolean {
    const instance = this.instances.get(instanceId)
    if (!instance) return false

    instance.context = { ...instance.context, ...updates }
    instance.updatedAt = new Date()
    return true
  }

  getContext(instanceId: string): Record<string, unknown> | undefined {
    return this.instances.get(instanceId)?.context
  }
}

// Pre-built workflow templates
export const WORKFLOW_TEMPLATES = {
  codeReview: (): WorkflowDefinition => ({
    id: 'code-review',
    name: 'Code Review Workflow',
    description: 'Automated code review with human approval',
    version: '1.0',
    nodes: [
      { id: 'start', type: 'start', name: 'Start', config: {}, next: 'lint' },
      { id: 'lint', type: 'task', name: 'Run Linting', config: { taskType: 'lint', requiresApproval: false }, next: 'test' },
      { id: 'test', type: 'task', name: 'Run Tests', config: { taskType: 'test', requiresApproval: false }, next: 'review' },
      { id: 'review', type: 'approval', name: 'Code Review', config: { description: 'Review code changes', approver: 'reviewer' }, next: 'end' },
      { id: 'end', type: 'end', name: 'End', config: {} },
    ],
    edges: [
      { from: 'start', to: 'lint' },
      { from: 'lint', to: 'test' },
      { from: 'test', to: 'review' },
      { from: 'review', to: 'end' },
    ],
    initialContext: {},
  }),

  ticketProcessing: (): WorkflowDefinition => ({
    id: 'ticket-processing',
    name: 'Ticket Processing Workflow',
    description: 'Process support tickets with categorization',
    version: '1.0',
    nodes: [
      { id: 'start', type: 'start', name: 'Start', config: {}, next: 'categorize' },
      { id: 'categorize', type: 'agent', name: 'Categorize Ticket', config: { agentId: 'supervisor', task: 'Categorize this support ticket and determine priority' }, next: 'route' },
      { id: 'route', type: 'condition', name: 'Route by Priority', config: { condition: 'Is this a high priority ticket?' }, branches: [{ condition: 'high', next: 'urgent' }, { condition: 'normal', next: 'standard' }] },
      { id: 'urgent', type: 'agent', name: 'Urgent Processing', config: { agentId: 'executor', task: 'Handle urgent ticket immediately' }, next: 'notify' },
      { id: 'standard', type: 'task', name: 'Standard Processing', config: { taskType: 'process_ticket', requiresApproval: true }, next: 'notify' },
      { id: 'notify', type: 'agent', name: 'Send Notification', config: { agentId: 'notifier', task: 'Notify customer of ticket status' }, next: 'end' },
      { id: 'end', type: 'end', name: 'End', config: {} },
    ],
    edges: [
      { from: 'start', to: 'categorize' },
      { from: 'categorize', to: 'route' },
      { from: 'route', to: 'urgent', label: 'High' },
      { from: 'route', to: 'standard', label: 'Normal' },
      { from: 'urgent', to: 'notify' },
      { from: 'standard', to: 'notify' },
      { from: 'notify', to: 'end' },
    ],
    initialContext: {},
  }),
}