import type {
  AgentExecutor,
  Checkpoint,
  HandoffRequest,
  WorkflowContext,
  WorkflowEdge,
  WorkflowNode,
} from './types.js'
import { SpecialistAgent, SupervisorAgent } from './agents.js'

export class WorkflowEngine {
  private nodes: Map<string, WorkflowNode> = new Map()
  private edges: WorkflowEdge[] = []
  private agents: Map<string, AgentExecutor> = new Map()

  constructor(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
    for (const node of nodes) {
      this.nodes.set(node.id, node)
      if (node.agent) {
        if (node.type === 'supervisor') {
          this.agents.set(
            node.id,
            new SupervisorAgent(node.agent, () =>
              this.listNodes().map(n => ({ id: n.id, type: n.type, name: n.name }))),
          )
        }
        else if (node.type === 'specialist') {
          this.agents.set(node.id, new SpecialistAgent(node.agent))
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

  async runContext(context: WorkflowContext): Promise<WorkflowContext> {
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
        }
        else {
          context.state = 'completed'
        }
      }
      catch (error) {
        context.state = 'failed'
        context.data.error = error instanceof Error ? error.message : String(error)
        break
      }
    }

    if (iterations >= maxIterations) {
      context.state = 'failed'
      context.data.error = 'Max iterations exceeded'
    }

    return context
  }

  private findStartNode(): string {
    const startNodes = Array.from(this.nodes.values()).filter(n => n.type === 'supervisor')
    return startNodes[0]?.id || ''
  }

  private async executeNode(
    node: WorkflowNode,
    context: WorkflowContext,
  ): Promise<{ nextNode?: string, waitForApproval?: boolean, output?: unknown, handoff?: HandoffRequest }> {
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
      context.data.lastAgentError = result.output
    }

    if (result.handoff) {
      context.data.lastHandoff = result.handoff
      if (this.nodes.has(result.handoff.to)) {
        return { nextNode: result.handoff.to, output: result.output, handoff: result.handoff }
      }
    }

    const nextEdge = this.selectNextEdge(node, context)
    if (!nextEdge)
      return { nextNode: undefined }

    if (typeof node.next === 'function') {
      return { nextNode: node.next(context), output: result.output }
    }

    return { nextNode: nextEdge.to, output: result.output }
  }

  private selectNextEdge(node: WorkflowNode, context: WorkflowContext): WorkflowEdge | undefined {
    const outgoing = this.edges.filter(e => e.from === node.id)
    const conditional = outgoing.find(e => e.condition?.(context) === true)
    if (conditional)
      return conditional
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
    if (!checkpoint)
      return false

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
