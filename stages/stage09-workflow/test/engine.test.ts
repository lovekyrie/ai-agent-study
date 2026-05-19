import { describe, expect, it, vi } from 'vitest'
import { WorkflowBuilder, WorkflowEngine } from '../src/index.js'
import type { WorkflowContext, WorkflowEdge, WorkflowNode } from '../src/index.js'

// Mock llm-client so agents don't hit real APIs
vi.mock('@ai-agent-study/llm-client', () => ({
  createLLMClient: () => ({
    chat: vi.fn().mockResolvedValue({ content: 'done', role: 'assistant' }),
  }),
}))

function makeContext(engine: WorkflowEngine, overrides: Partial<WorkflowContext> = {}): WorkflowContext {
  return {
    workflowId: 'test-wf',
    state: 'running',
    currentNode: 'end',
    data: {},
    history: [],
    checkpoints: new Map(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('WorkflowEngine', () => {
  it('completes immediately for end node', async () => {
    const nodes: WorkflowNode[] = [
      { id: 'end', type: 'end', name: 'End', description: 'done' },
    ]
    const engine = new WorkflowEngine(nodes, [])
    const ctx = makeContext(engine, { currentNode: 'end' })
    const result = await engine.runContext(ctx)
    expect(result.state).toBe('completed')
  })

  it('stops at approval node', async () => {
    const nodes: WorkflowNode[] = [
      { id: 'sup', type: 'supervisor', name: 'Sup', description: 'supervisor', agent: { name: 'sup', role: 'Supervisor', instructions: 'delegate' } },
      { id: 'approve', type: 'approval', name: 'Approval', description: 'needs approval' },
      { id: 'end', type: 'end', name: 'End', description: 'done' },
    ]
    const edges: WorkflowEdge[] = [
      { from: 'sup', to: 'approve' },
      { from: 'approve', to: 'end' },
    ]
    const engine = new WorkflowEngine(nodes, edges)
    const result = await engine.execute('wf-1')
    expect(result.state).toBe('waiting_approval')
    expect(result.currentNode).toBe('approve')
  })

  it('approve resumes workflow through approval node', async () => {
    const nodes: WorkflowNode[] = [
      { id: 'approve', type: 'approval', name: 'Approval', description: 'needs approval' },
      { id: 'end', type: 'end', name: 'End', description: 'done' },
    ]
    const edges: WorkflowEdge[] = [{ from: 'approve', to: 'end' }]
    const engine = new WorkflowEngine(nodes, edges)
    const ctx = makeContext(engine, { currentNode: 'approve', state: 'waiting_approval' })
    const result = await engine.approve(ctx)
    expect(result.state).toBe('completed')
  })

  it('approve throws if not in waiting_approval state', async () => {
    const engine = new WorkflowEngine([], [])
    const ctx = makeContext(engine, { state: 'running' })
    await expect(engine.approve(ctx)).rejects.toThrow('not waiting for approval')
  })

  it('fails if current node is missing', async () => {
    const engine = new WorkflowEngine([], [])
    const ctx = makeContext(engine, { currentNode: 'nonexistent' })
    const result = await engine.runContext(ctx)
    expect(result.state).toBe('failed')
  })

  it('getNode and listNodes work', () => {
    const nodes: WorkflowNode[] = [
      { id: 'a', type: 'end', name: 'A', description: '' },
      { id: 'b', type: 'approval', name: 'B', description: '' },
    ]
    const engine = new WorkflowEngine(nodes, [])
    expect(engine.getNode('a')?.name).toBe('A')
    expect(engine.listNodes()).toHaveLength(2)
    expect(engine.getNode('missing')).toBeUndefined()
  })

  it('checkpoint create and restore', async () => {
    const engine = new WorkflowEngine([], [])
    const ctx = makeContext(engine, { data: { key: 'value' }, currentNode: 'n1' })
    const cp = engine.createCheckpoint(ctx, 'n1')
    expect(cp.nodeId).toBe('n1')
    expect(cp.data['key']).toBe('value')

    // Modify context
    ctx.data['key'] = 'changed'
    ctx.currentNode = 'n2'

    // Restore
    const restored = await engine.restoreFromCheckpoint(ctx, 'n1')
    expect(restored).toBe(true)
    expect(ctx.data['key']).toBe('value')
    expect(ctx.currentNode).toBe('n1')
  })

  it('restoreFromCheckpoint returns false for missing checkpoint', async () => {
    const engine = new WorkflowEngine([], [])
    const ctx = makeContext(engine)
    const result = await engine.restoreFromCheckpoint(ctx, 'nope')
    expect(result).toBe(false)
  })
})

describe('WorkflowBuilder', () => {
  it('builds a workflow engine with all node types', () => {
    const engine = new WorkflowBuilder()
      .addSupervisor('sup', 'Supervisor', 'Manager', 'instructions')
      .addSpecialist('spec', 'Specialist', 'Worker', 'do work')
      .addApproval('approve', 'Approval', 'needs approval')
      .addEnd('end', 'End')
      .addEdge('sup', 'spec')
      .addEdge('spec', 'approve')
      .addEdge('approve', 'end')
      .build()

    expect(engine.listNodes()).toHaveLength(4)
    expect(engine.getNode('sup')?.type).toBe('supervisor')
    expect(engine.getNode('spec')?.type).toBe('specialist')
    expect(engine.getNode('approve')?.type).toBe('approval')
    expect(engine.getNode('end')?.type).toBe('end')
  })

  it('edge conditions are evaluated during execution', async () => {
    const engine = new WorkflowBuilder()
      .addSupervisor('sup', 'Sup', 'Sup', 'noop')
      .addSpecialist('a', 'A', 'A', 'noop')
      .addEnd('end', 'End')
      .addEdge('sup', 'a', (ctx) => ctx.data['goA'] === true)
      .addEdge('sup', 'end')
      .build()

    // Without goA, should fall through to unconditional edge → end
    const result = await engine.execute('wf', { goA: false })
    // The supervisor agent responds (mock returns 'done'), no handoff → engine picks edge
    expect(result.state).toBe('completed')
  })
})
