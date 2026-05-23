import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LLMClient,
} from '@ai-agent-study/llm-client'
import type { ToolDefinition } from '@ai-agent-study/tools'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { Agent } from '../src/agent.js'

/** 构造一个最小可用的 LLMClient mock，按预设脚本逐轮返回 */
function makeMockClient(responses: ChatResponse[]): {
  client: LLMClient
  calls: { messages: ChatMessage[], options?: ChatOptions }[]
} {
  const calls: { messages: ChatMessage[], options?: ChatOptions }[] = []
  let i = 0
  const client = {
    chat: vi.fn(async (messages: ChatMessage[], options?: ChatOptions) => {
      calls.push({ messages: [...messages], options })
      const resp = responses[i++]
      if (!resp)
        throw new Error(`Mock client ran out of responses (call #${i})`)
      return resp
    }),
    stream: vi.fn(),
    jsonStructured: vi.fn(),
  } as unknown as LLMClient
  return { client, calls }
}

function makeEchoTool(name = 'echo'): ToolDefinition {
  return {
    name,
    description: 'returns its input verbatim',
    parameters: z.object({ text: z.string() }),
    execute: async params => ({
      content: `echo:${(params as { text: string }).text}`,
    }),
  }
}

describe('agent: ReAct loop', () => {
  it('returns final answer when LLM does not request tools', async () => {
    const { client } = makeMockClient([
      {
        content: 'hello world',
        finishReason: 'stop',
      },
    ])
    const agent = new Agent({ llmClient: client })
    const response = await agent.run('hi')

    expect(response.status).toBe('done')
    expect(response.message).toBe('hello world')
    expect(response.trace.iterations).toBe(1)
    expect(response.trace.steps[0].toolCalls).toEqual([])
  })

  it('executes parallel tool_calls and feeds all results back', async () => {
    const { client, calls } = makeMockClient([
      {
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'echo', arguments: '{"text":"a"}' },
          },
          {
            id: 'call_2',
            type: 'function',
            function: { name: 'echo', arguments: '{"text":"b"}' },
          },
        ],
      },
      { content: 'done', finishReason: 'stop' },
    ])
    const agent = new Agent({ llmClient: client, tools: [makeEchoTool()] })

    const response = await agent.run('do a and b')

    expect(response.status).toBe('done')
    expect(response.trace.iterations).toBe(2)

    // 关键断言：assistant 消息保留了 tool_calls 字段
    const round2Messages = calls[1].messages
    const assistantWithCalls = round2Messages.find(
      m => m.role === 'assistant' && (m.tool_calls?.length ?? 0) > 0,
    )
    expect(assistantWithCalls).toBeDefined()
    expect(assistantWithCalls?.tool_calls).toHaveLength(2)

    // 关键断言：两个 tool_call 都有对应 role:'tool' 消息
    const toolMessages = round2Messages.filter(m => m.role === 'tool')
    expect(toolMessages).toHaveLength(2)
    expect(toolMessages.map(m => m.tool_call_id).sort()).toEqual(['call_1', 'call_2'])
    expect(toolMessages.find(m => m.tool_call_id === 'call_1')?.content).toBe('echo:a')
    expect(toolMessages.find(m => m.tool_call_id === 'call_2')?.content).toBe('echo:b')
  })

  it('does NOT auto-finish after first successful tool call (lets LLM decide)', async () => {
    const { client } = makeMockClient([
      {
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'echo', arguments: '{"text":"first"}' },
          },
        ],
      },
      {
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'c2',
            type: 'function',
            function: { name: 'echo', arguments: '{"text":"second"}' },
          },
        ],
      },
      { content: 'finally', finishReason: 'stop' },
    ])
    const agent = new Agent({ llmClient: client, tools: [makeEchoTool()] })
    const response = await agent.run('multi-step')

    // 3 轮：tool, tool, final answer
    expect(response.trace.iterations).toBe(3)
    expect(response.message).toBe('finally')
  })

  it('handles malformed tool arguments JSON gracefully', async () => {
    const { client } = makeMockClient([
      {
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'echo', arguments: 'not-json' },
          },
        ],
      },
      { content: 'recovered', finishReason: 'stop' },
    ])
    const agent = new Agent({ llmClient: client, tools: [makeEchoTool()] })
    const response = await agent.run('bad args')

    // tool 执行会因 zod 校验失败而返回 error，但 agent 不应崩溃
    expect(response.status).toBe('done')
    const errResult = response.trace.steps[0].toolResults[0]
    expect(errResult.error).toMatch(/parameter validation failed/)
  })

  it('stops at maxIterations with status=max_iterations', async () => {
    const toolCall = {
      id: 'loop',
      type: 'function' as const,
      function: { name: 'echo', arguments: '{"text":"x"}' },
    }
    // 模型永远请求工具，不给最终答案
    const { client } = makeMockClient(
      Array.from({ length: 5 }).fill(null).map(() => ({
        content: '',
        finishReason: 'tool_calls' as const,
        toolCalls: [toolCall],
      })),
    )
    const agent = new Agent({
      llmClient: client,
      tools: [makeEchoTool()],
      maxIterations: 3,
    })
    const response = await agent.run('loop forever')

    expect(response.status).toBe('max_iterations')
    expect(response.trace.iterations).toBe(3)
  })

  it('emits onStep callback for every step', async () => {
    const { client } = makeMockClient([
      {
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [
          { id: 'c1', type: 'function', function: { name: 'echo', arguments: '{"text":"x"}' } },
        ],
      },
      { content: 'done', finishReason: 'stop' },
    ])
    const observed: number[] = []
    const agent = new Agent({
      llmClient: client,
      tools: [makeEchoTool()],
      onStep: s => observed.push(s.stepNumber),
    })
    await agent.run('go')
    expect(observed).toEqual([1, 2])
  })

  it('respects permissions: tool requiring approval blocked by default', async () => {
    const tool: ToolDefinition = {
      ...makeEchoTool('danger'),
      requiresApproval: true,
    }
    const { client } = makeMockClient([
      {
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [
          { id: 'c1', type: 'function', function: { name: 'danger', arguments: '{"text":"x"}' } },
        ],
      },
      { content: 'fallback', finishReason: 'stop' },
    ])
    const agent = new Agent({ llmClient: client, tools: [tool] /* no permissions */ })
    const response = await agent.run('use danger')

    expect(response.trace.steps[0].toolResults[0].error).toMatch(/approval/)
  })

  it('supports AbortSignal cancellation', async () => {
    const controller = new AbortController()
    const { client } = makeMockClient([
      // 第一轮就 abort
      { content: 'irrelevant', finishReason: 'stop' },
    ])
    const agent = new Agent({ llmClient: client, signal: controller.signal })
    controller.abort()

    const response = await agent.run('go')
    expect(response.status).toBe('error')
    expect(response.trace.status).toBe('error')
  })

  it('produces independent traces across multiple run() calls', async () => {
    const { client } = makeMockClient([
      { content: 'A', finishReason: 'stop' },
      { content: 'B', finishReason: 'stop' },
    ])
    const agent = new Agent({ llmClient: client })
    const r1 = await agent.run('task A')
    const r2 = await agent.run('task B')
    expect(r1.trace.task).toBe('task A')
    expect(r1.message).toBe('A')
    expect(r2.trace.task).toBe('task B')
    expect(r2.message).toBe('B')
    // trace 互相独立
    expect(r1.trace.steps).not.toBe(r2.trace.steps)
  })

  /**
   * 集成测试：多工具混合编排
   *
   * 模拟一个常见场景：
   *   1. 用户问"123 加 456 等于多少？再帮我搜一下 Vue 是什么"
   *   2. Agent 调用 calculator 算出 579
   *   3. Agent 调用 search 拿到 Vue 的描述
   *   4. Agent 综合两个结果给出最终答案
   *
   * 这是 stage04 的"压轴"——证明 Agent 能在不同工具之间正确编排，
   * 而且每个工具的结果都正确路由回 LLM。
   */
  it('integration: multi-tool sequence with calculator + search and final synthesis', async () => {
    const calcTool: ToolDefinition = {
      name: 'calculator',
      description: 'evaluate arithmetic',
      parameters: z.object({ expr: z.string() }),
      execute: async (params) => {
        const expr = (params as { expr: string }).expr
        // 极简实现：只支持 a+b
        const match = /^(\d+)\s*\+\s*(\d+)$/.exec(expr)
        if (!match)
          return { content: '', error: 'unsupported expr' }
        return { content: String(Number(match[1]) + Number(match[2])) }
      },
    }
    const searchTool: ToolDefinition = {
      name: 'search',
      description: 'search the web',
      parameters: z.object({ query: z.string() }),
      execute: async params => ({
        content: `[search result for "${(params as { query: string }).query}"]: A progressive JS framework.`,
      }),
    }

    const { client, calls } = makeMockClient([
      // 第 1 轮：模型同时请求两个工具
      {
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 't_calc',
            type: 'function',
            function: { name: 'calculator', arguments: '{"expr":"123 + 456"}' },
          },
          {
            id: 't_search',
            type: 'function',
            function: { name: 'search', arguments: '{"query":"Vue.js"}' },
          },
        ],
      },
      // 第 2 轮：模型综合两个工具结果给出答案
      {
        content: '123 + 456 = 579；Vue 是一个渐进式 JS 框架。',
        finishReason: 'stop',
      },
    ])

    const observed: number[] = []
    const agent = new Agent({
      llmClient: client,
      tools: [calcTool, searchTool],
      onStep: s => observed.push(s.stepNumber),
    })

    const response = await agent.run('123 加 456 等于多少？再帮我搜一下 Vue 是什么')

    // 1) 整体收敛
    expect(response.status).toBe('done')
    expect(response.trace.iterations).toBe(2)
    expect(response.message).toContain('579')
    expect(response.message).toContain('Vue')

    // 2) 第一步：两个工具都被调用，且参数路由正确
    const step1 = response.trace.steps[0]
    expect(step1.toolCalls.map(c => c.name).sort()).toEqual(['calculator', 'search'])
    expect(step1.toolResults).toHaveLength(2)
    const calcResult = step1.toolResults.find(
      (_, i) => step1.toolCalls[i].name === 'calculator',
    )
    expect(calcResult?.content).toBe('579')

    // 3) 第二轮 chat 应能"看到"两条 role:'tool' 消息（协议契约）
    const round2 = calls[1].messages
    const toolMsgs = round2.filter(m => m.role === 'tool')
    expect(toolMsgs).toHaveLength(2)
    expect(toolMsgs.map(m => m.tool_call_id).sort()).toEqual(['t_calc', 't_search'])

    // 4) onStep 回调按 step 顺序触发
    expect(observed).toEqual([1, 2])
  })
})
