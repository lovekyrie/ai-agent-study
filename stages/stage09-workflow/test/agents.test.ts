import type { WorkflowContext } from '../src/types.js'
import { describe, expect, it, vi } from 'vitest'
import { SpecialistAgent, SupervisorAgent } from '../src/agents.js'

const mockChat = vi.fn()

vi.mock('@ai-agent-study/llm-client', () => ({
  createLLMClient: () => ({ chat: mockChat }),
}))

function makeContext(overrides: Partial<WorkflowContext> = {}): WorkflowContext {
  return {
    workflowId: 'test',
    state: 'running',
    currentNode: 'sup',
    data: {},
    history: [],
    checkpoints: new Map(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('supervisorAgent', () => {
  it('returns handoff when LLM mentions handoff:<target>', async () => {
    mockChat.mockResolvedValueOnce({ content: 'handoff: security\nreason: needs review', role: 'assistant' })

    const agent = new SupervisorAgent(
      { name: 'sup', role: 'Supervisor', instructions: 'delegate' },
      () => [{ id: 'security', type: 'specialist', name: 'Security' }],
    )

    const result = await agent.execute(makeContext())
    expect(result.success).toBe(true)
    expect(result.handoff?.to).toBe('security')
    expect(result.handoff?.reason).toBe('needs review')
  })

  it('returns no handoff for generic response', async () => {
    mockChat.mockResolvedValueOnce({ content: 'All looks good, task complete.', role: 'assistant' })

    const agent = new SupervisorAgent(
      { name: 'sup', role: 'Supervisor', instructions: 'noop' },
      () => [],
    )

    const result = await agent.execute(makeContext())
    expect(result.success).toBe(true)
    expect(result.handoff).toBeUndefined()
  })

  it('handles LLM error gracefully', async () => {
    mockChat.mockRejectedValueOnce(new Error('API timeout'))

    const agent = new SupervisorAgent(
      { name: 'sup', role: 'Supervisor', instructions: 'noop' },
      () => [],
    )

    const result = await agent.execute(makeContext())
    expect(result.success).toBe(false)
    expect(result.output).toBe('API timeout')
  })
})

describe('specialistAgent', () => {
  it('returns handoff when LLM says handoff:supervisor', async () => {
    mockChat.mockResolvedValueOnce({ content: 'Review done. handoff:supervisor', role: 'assistant' })

    const agent = new SpecialistAgent({ name: 'sec', role: 'Security', instructions: 'review' })
    const result = await agent.execute(makeContext())

    expect(result.success).toBe(true)
    expect(result.handoff?.to).toBe('supervisor')
  })

  it('completes without handoff for normal response', async () => {
    mockChat.mockResolvedValueOnce({ content: 'No issues found.', role: 'assistant' })

    const agent = new SpecialistAgent({ name: 'sec', role: 'Security', instructions: 'review' })
    const result = await agent.execute(makeContext())

    expect(result.success).toBe(true)
    expect(result.handoff).toBeUndefined()
    expect(result.output).toBe('No issues found.')
  })

  it('handles LLM error gracefully', async () => {
    mockChat.mockRejectedValueOnce(new Error('Rate limited'))

    const agent = new SpecialistAgent({ name: 'sec', role: 'Security', instructions: 'review' })
    const result = await agent.execute(makeContext())

    expect(result.success).toBe(false)
    expect(result.output).toBe('Rate limited')
  })
})
