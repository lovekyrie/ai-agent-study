import { createLLMClient, type ChatMessage } from '@ai-agent-study/llm-client'

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

export class WorkflowEngine {
  private nodes: Map<string, WorkflowNode> = new Map()
  private edges: WorkflowEdge[] = []
  private client = createLLMClient()
  private agents: Map<string, SupervisorAgent | SpecialistAgent> = new Map()

  constructor(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
    for (const node of nodes) {
      this.nodes.set(node.id, node)
      if (node.agent) {
        if (node.type === 'supervisor') {
          this.agents.set(node.id, new SupervisorAgent(node.agent, this))
        } else if (node.type === 'specialist') {
          this.agents.set(node.id, new SpecialistAgent(node.agent, this))
        }
      }
    }
    this.edges = edges
  }

  async execute(workflowId: string, initialData: Record<string, unknown> = {}): Promise<WorkflowContext> {
    const context: WorkflowContext = {
      workflowId,
      state: 'running',
      currentNode: this.findStartNode(),
      data: initialData,
      history: [],
      checkpoints: new Map(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    return this.runContext(context)
  }

  private async runContext(context: WorkflowContext): Promise<WorkflowContext> {
    let iterations = 0
    const maxIterations = 100

    while (context.state === 'running' && iterations < maxIterations) {
      iterations++
      const node = this.nodes.get(context.currentNode)
      if (!node) {
        context.state = 'failed'
        break
      }

      context.history.push({
        nodeId: node.id,
        action: 'entered',
        input: context.data,
        output: null,
        timestamp: new Date(),
      })

      try {
        const result = await this.executeNode(node, context)
        context.history.push({
          nodeId: node.id,
          action: 'executed',
          input: context.data,
          output: result,
          timestamp: new Date(),
        })
        if (result.waitForApproval) {
          context.state = 'waiting_approval'
          break
        }
        if (result.nextNode) {
          context.currentNode = result.nextNode
          context.updatedAt = new Date()
        } else {
          context.state = 'completed'
        }
      } catch (error) {
        context.state = 'failed'
        context.data['error'] = error instanceof Error ? error.message : String(error)
        break
      }
    }

    if (iterations >= maxIterations) {
      context.state = 'failed'
      context.data['error'] = 'Max iterations exceeded'
    }

    return context
  }

  private findStartNode(): string {
    const startNodes = Array.from(this.nodes.values()).filter(n => n.type === 'supervisor')
    return startNodes[0]?.id || ''
  }

  private async executeNode(node: WorkflowNode, context: WorkflowContext): Promise<{ nextNode?: string; waitForApproval?: boolean; output?: unknown; handoff?: HandoffRequest }> {
    if (node.type === 'end') {
      return { nextNode: undefined }
    }

    if (node.type === 'approval') {
      return { waitForApproval: true }
    }

    const agent = this.agents.get(node.id)
    if (!agent) {
      const nextEdge = this.selectNextEdge(node, context)
      return { nextNode: nextEdge?.to }
    }

    const result = await agent.execute(context)
    context.data[`${node.id}Output`] = result.output
    context.data[`${node.id}Success`] = result.success

    if (node.type === 'specialist') {
      context.data[`${node.id}Review`] = result.output
      context.data[`${node.id}Completed`] = result.success
    }

    if (!result.success) {
      context.data['lastAgentError'] = result.output
    }

    if (result.handoff) {
      context.data['lastHandoff'] = result.handoff
      if (this.nodes.has(result.handoff.to)) {
        return { nextNode: result.handoff.to, output: result.output, handoff: result.handoff }
      }
    }

    const nextEdge = this.selectNextEdge(node, context)
    if (!nextEdge) return { nextNode: undefined }

    if (typeof node.next === 'function') {
      return { nextNode: node.next(context), output: result.output }
    }

    return { nextNode: nextEdge.to, output: result.output }
  }

  private selectNextEdge(node: WorkflowNode, context: WorkflowContext): WorkflowEdge | undefined {
    const outgoing = this.edges.filter(e => e.from === node.id)
    const conditional = outgoing.find(e => e.condition?.(context) === true)
    if (conditional) return conditional
    return outgoing.find(e => !e.condition)
  }

  getNode(id: string): WorkflowNode | undefined {
    return this.nodes.get(id)
  }

  listNodes(): WorkflowNode[] {
    return Array.from(this.nodes.values())
  }

  createCheckpoint(context: WorkflowContext, nodeId: string): Checkpoint {
    const checkpoint: Checkpoint = {
      id: `${context.workflowId}-${nodeId}-${Date.now()}`,
      nodeId,
      state: context.state,
      data: { ...context.data },
      timestamp: new Date(),
    }
    context.checkpoints.set(nodeId, checkpoint)
    return checkpoint
  }

  async restoreFromCheckpoint(context: WorkflowContext, nodeId: string): Promise<boolean> {
    const checkpoint = context.checkpoints.get(nodeId) as Checkpoint | undefined
    if (!checkpoint) return false

    context.state = checkpoint.state
    context.data = { ...checkpoint.data }
    context.currentNode = nodeId
    context.updatedAt = new Date()
    return true
  }

  async approve(context: WorkflowContext): Promise<WorkflowContext> {
    if (context.state !== 'waiting_approval') {
      throw new Error('Workflow is not waiting for approval')
    }

    const approvalNode = this.nodes.get(context.currentNode)
    if (!approvalNode || approvalNode.type !== 'approval') {
      throw new Error('Current node is not an approval node')
    }

    context.state = 'running'
    context.updatedAt = new Date()

    const nextEdge = this.edges.find(e => e.from === approvalNode.id)
    if (nextEdge) {
      context.currentNode = nextEdge.to
    }

    return this.runContext(context)
  }
}

interface AgentExecutor {
  execute(context: WorkflowContext): Promise<AgentExecutionResult>
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

class SupervisorAgent implements AgentExecutor {
  protected agentConfig: AgentConfig
  protected engine: WorkflowEngine
  protected client = createLLMClient()

  constructor(config: AgentConfig, engine: WorkflowEngine) {
    this.agentConfig = config
    this.engine = engine
  }

  async execute(context: WorkflowContext): Promise<AgentExecutionResult> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a ${this.agentConfig.role}. ${this.agentConfig.instructions}

Current workflow state: ${context.state}
Current node: ${context.currentNode}
Available nodes: ${JSON.stringify(this.engine.listNodes().map(n => ({ id: n.id, type: n.type, name: n.name })))}

Analyze the current state and decide what specialist to delegate to next, or if the task is complete.`,
      },
      {
        role: 'user',
        content: `Task context: ${JSON.stringify(context.data, null, 2)}

What should happen next? Provide your decision and any necessary actions.`,
      },
    ]

    try {
      const response = await this.client.chat(messages)
      const decision = this.parseSupervisorDecision(response.content)

      if (decision.handoff) {
        return {
          success: true,
          output: response.content,
          handoff: {
            to: decision.handoff,
            reason: decision.reason || 'Supervisor delegated to specialist',
            context: context.data,
          },
        }
      }

      return { success: true, output: response.content }
    } catch (error) {
      return {
        success: false,
        output: error instanceof Error ? error.message : String(error),
      }
    }
  }

  protected parseSupervisorDecision(content: string): { handoff?: string; reason?: string } {
      const handoffMatch = content.match(/handoff:\s*([\w-]+)/i) || content.match(/delegate to:\s*([\w-]+)/i)
    const reasonMatch = content.match(/reason:(.+)/i)

    if (handoffMatch) {
      return {
        handoff: handoffMatch[1].trim(),
        reason: reasonMatch ? reasonMatch[1].trim() : undefined,
      }
    }

    return {}
  }
}

class SpecialistAgent implements AgentExecutor {
  protected agentConfig: AgentConfig
  protected engine: WorkflowEngine
  protected client = createLLMClient()

  constructor(config: AgentConfig, engine: WorkflowEngine) {
    this.agentConfig = config
    this.engine = engine
  }

  async execute(context: WorkflowContext): Promise<AgentExecutionResult> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a ${this.agentConfig.role}. ${this.agentConfig.instructions}`,
      },
      {
        role: 'user',
        content: `Task: ${JSON.stringify(context.data, null, 2)}

Complete your specialized task and report the results. If you need to handoff back to the supervisor, indicate "handoff:supervisor" in your response.`,
      },
    ]

    try {
      const response = await this.client.chat(messages)

      const isHandoff = /handoff:supervisor/i.test(response.content)
      if (isHandoff) {
        return {
          success: true,
          output: response.content,
          handoff: {
            to: 'supervisor',
            reason: 'Specialist completed task, returning to supervisor',
            context: context.data,
          },
        }
      }

      return { success: true, output: response.content }
    } catch (error) {
      return {
        success: false,
        output: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

export class WorkflowBuilder {
  private nodes: WorkflowNode[] = []
  private edges: WorkflowEdge[] = []

  addSupervisor(id: string, name: string, role: string, instructions: string): this {
    this.nodes.push({
      id,
      type: 'supervisor',
      name,
      description: role,
      agent: { name: id, role, instructions },
    })
    return this
  }

  addSpecialist(id: string, name: string, role: string, instructions: string): this {
    this.nodes.push({
      id,
      type: 'specialist',
      name,
      description: role,
      agent: { name: id, role, instructions },
    })
    return this
  }

  addApproval(id: string, name: string, description: string): this {
    this.nodes.push({
      id,
      type: 'approval',
      name,
      description,
    })
    return this
  }

  addEnd(id: string, name: string): this {
    this.nodes.push({
      id,
      type: 'end',
      name,
      description: 'End of workflow',
    })
    return this
  }

  addEdge(from: string, to: string, condition?: (ctx: WorkflowContext) => boolean): this {
    this.edges.push({ from, to, condition })
    return this
  }

  build(): WorkflowEngine {
    return new WorkflowEngine(this.nodes, this.edges)
  }
}

export function createCodeReviewWorkflow(): WorkflowEngine {
  return new WorkflowBuilder()
    .addSupervisor(
      'supervisor',
      'Code Review Supervisor',
      'Code Review Supervisor',
      `You oversee the code review process. You have the following specialists available:
- security: Security expert who reviews for vulnerabilities
- performance: Performance expert who reviews for efficiency issues
- style: Code style expert who reviews for maintainability

Analyze the code change and delegate to appropriate specialists. When all reviews are complete, determine if the code can be approved or needs changes.`
    )
    .addSpecialist(
      'security',
      'Security Reviewer',
      'Security Expert',
      `You are a security expert reviewing code changes. Look for:
- SQL injection vulnerabilities
- XSS vulnerabilities
- Authentication/authorization issues
- Data exposure risks
- Dependency vulnerabilities

Provide a detailed security assessment with severity levels (critical/high/medium/low).`
    )
    .addSpecialist(
      'performance',
      'Performance Reviewer',
      'Performance Expert',
      `You are a performance expert reviewing code changes. Look for:
- N+1 query problems
- Memory leaks
- Inefficient algorithms
- Missing indexes
- Caching opportunities

Provide a detailed performance assessment with recommendations.`
    )
    .addSpecialist(
      'style',
      'Style Reviewer',
      'Code Style Expert',
      `You are a code style expert reviewing code changes. Look for:
- Naming conventions violations
- Missing documentation
- Code duplication
- Complex conditional logic
- Error handling issues

Provide a detailed style assessment with suggestions for improvement.`
    )
    .addApproval('approval', 'Manager Approval', 'Requires manager approval for merged changes')
    .addEnd('end', 'Complete')
    .addEdge('supervisor', 'security', (ctx) => ctx.data['securityCompleted'] !== true)
    .addEdge('supervisor', 'performance', (ctx) => ctx.data['securityCompleted'] === true && ctx.data['performanceCompleted'] !== true)
    .addEdge('supervisor', 'style', (ctx) => ctx.data['securityCompleted'] === true && ctx.data['performanceCompleted'] === true && ctx.data['styleCompleted'] !== true)
    .addEdge('security', 'supervisor')
    .addEdge('performance', 'supervisor')
    .addEdge('style', 'supervisor')
    .addEdge('supervisor', 'approval', (ctx) =>
      ctx.data['securityCompleted'] === true &&
      ctx.data['performanceCompleted'] === true &&
      ctx.data['styleCompleted'] === true
    )
    .addEdge('approval', 'end')
    .build()
}
