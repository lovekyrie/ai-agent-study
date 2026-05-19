/**
 * Stage 03 教程级测试。
 *
 * 不重复 `packages/tools/test/registry.test.ts` 的内部细节；
 * 只验证 stage README 中宣称的：
 *   - 多轮工具循环的两个协议契约（assistant 携带 tool_calls / 每个 call 都有 tool 消息）
 *   - 三道防线：zod 参数校验 / requiresApproval 审批 / 业务级防护（zod schema 完整性）
 *   - 内置工具的安全（路径遍历拦截）
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ToolRegistry,
  builtinTools,
  readFileTool,
  type ToolCallRequest,
  type ToolDefinition,
} from '@ai-agent-study/tools'
import type {
  ChatMessage,
  ChatResponse,
  LLMClient,
} from '@ai-agent-study/llm-client'

// ============================================================================
// 工具循环（教程模式 1）：协议契约
// ============================================================================

function fakeLLMClient(responses: ChatResponse[]) {
  let i = 0
  const sentMessages: ChatMessage[][] = []
  const client = {
    chat: vi.fn(async (messages: ChatMessage[]) => {
      sentMessages.push(messages.map((m) => ({ ...m })))
      const r = responses[i++]
      if (!r) throw new Error('mock ran out of chat responses')
      return r
    }),
    stream: vi.fn(),
    jsonStructured: vi.fn(),
  } as unknown as LLMClient
  return { client, sentMessages }
}

/** 教程示例里的多轮工具循环抽成可测的小函数 */
async function runToolLoop(
  client: LLMClient,
  registry: ToolRegistry,
  initialMessage: string,
  maxIter = 5
): Promise<ChatMessage[]> {
  const history: ChatMessage[] = [{ role: 'user', content: initialMessage }]
  const llmTools = registry.toLLMFormat()

  for (let iter = 0; iter < maxIter; iter++) {
    const response = await client.chat(history, { tools: llmTools })

    if (!response.toolCalls || response.toolCalls.length === 0) {
      history.push({ role: 'assistant', content: response.content })
      return history
    }

    // 协议契约 1
    history.push({
      role: 'assistant',
      content: response.content,
      tool_calls: response.toolCalls,
    })

    const requests: ToolCallRequest[] = response.toolCalls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || '{}'),
    }))
    const results = await registry.executeBatch(requests)

    // 协议契约 2
    for (let j = 0; j < requests.length; j++) {
      history.push({
        role: 'tool',
        tool_call_id: requests[j].id ?? '',
        content: results[j].error ? `ERROR: ${results[j].error}` : results[j].content,
      })
    }
  }
  return history
}

describe('Stage 03 教程模式 1: 多轮工具循环遵守 OpenAI 协议契约', () => {
  it('assistant 消息保留 tool_calls，每个 call 都对应一条 role:tool 消息', async () => {
    const registry = new ToolRegistry()
    registry.register({
      name: 'echo',
      description: 'echo input',
      parameters: z.object({ text: z.string() }),
      execute: (params) => ({ content: `echo:${(params as { text: string }).text}` }),
    })

    const { client } = fakeLLMClient([
      {
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [
          { id: 'c1', type: 'function', function: { name: 'echo', arguments: '{"text":"a"}' } },
          { id: 'c2', type: 'function', function: { name: 'echo', arguments: '{"text":"b"}' } },
        ],
      },
      { content: '完成', finishReason: 'stop' },
    ])

    const history = await runToolLoop(client, registry, 'do a and b')

    // 协议契约 1: 应有一条 assistant 消息携带 tool_calls
    const assistantWithCalls = history.find(
      (m) => m.role === 'assistant' && (m.tool_calls?.length ?? 0) === 2
    )
    expect(assistantWithCalls).toBeDefined()

    // 协议契约 2: 每个 call 都对应一条 role:'tool'，按 id 关联
    const toolMessages = history.filter((m) => m.role === 'tool')
    expect(toolMessages).toHaveLength(2)
    expect(toolMessages.map((m) => m.tool_call_id).sort()).toEqual(['c1', 'c2'])
    expect(toolMessages.find((m) => m.tool_call_id === 'c1')?.content).toBe('echo:a')
  })

  it('模型不再请求工具 → 循环立即结束', async () => {
    const registry = new ToolRegistry()
    const { client } = fakeLLMClient([{ content: '直接答', finishReason: 'stop' }])
    const history = await runToolLoop(client, registry, 'hi')

    // 只调用一次 chat，没有 role:'tool' 消息
    expect(history.filter((m) => m.role === 'tool')).toHaveLength(0)
    expect(history[history.length - 1]).toEqual({ role: 'assistant', content: '直接答' })
  })
})

// ============================================================================
// 三道防线（教程模式 2）
// ============================================================================

describe('Stage 03 教程模式 2: 防线 1 - zod 参数校验', () => {
  it('错误的参数类型直接被 registry 截胡，不进入 tool.execute', async () => {
    const executor = vi.fn()
    const registry = new ToolRegistry()
    registry.register({
      name: 'add',
      description: 'add two numbers',
      parameters: z.object({ a: z.number(), b: z.number() }),
      execute: executor,
    })

    const result = await registry.execute({ name: 'add', arguments: { a: 'not-number', b: 1 } })

    expect(result.error).toMatch(/parameter validation failed/)
    expect(executor).not.toHaveBeenCalled() // ← 关键：从未进入业务逻辑
  })

  it('未注册的工具返回 not-found（含可用列表，方便调试）', async () => {
    const registry = new ToolRegistry()
    registry.register({
      name: 'a',
      description: '',
      parameters: z.object({}),
      execute: () => ({ content: 'ok' }),
    })
    const result = await registry.execute({ name: 'b', arguments: {} })
    expect(result.error).toMatch(/not found/)
    expect(result.error).toMatch(/Available: a/)
  })
})

describe('Stage 03 教程模式 2: 防线 2 - requiresApproval 审批门', () => {
  function makeDangerousTool(executor: () => unknown): ToolDefinition {
    return {
      name: 'danger',
      description: 'dangerous op',
      parameters: z.object({}),
      execute: () => ({ content: String(executor()) }),
      requiresApproval: true,
    }
  }

  it('默认权限上下文（无 approve）→ 阻止执行', async () => {
    const executor = vi.fn(() => 'should-not-run')
    const registry = new ToolRegistry() // 没有 permissions
    registry.register(makeDangerousTool(executor))

    const result = await registry.execute({ name: 'danger', arguments: {} })

    expect(result.error).toMatch(/approval/)
    expect(executor).not.toHaveBeenCalled()
  })

  it('显式授权 approve → 放行', async () => {
    const executor = vi.fn(() => 'allowed')
    const registry = new ToolRegistry({ permissions: ['approve'] })
    registry.register(makeDangerousTool(executor))

    const result = await registry.execute({ name: 'danger', arguments: {} })

    expect(result.error).toBeUndefined()
    expect(result.content).toBe('allowed')
    expect(executor).toHaveBeenCalledTimes(1)
  })

  it('审批检查发生在参数校验之前（即使参数合法也先看权限）', async () => {
    const executor = vi.fn(() => ({ content: 'ok' }))
    const registry = new ToolRegistry()
    registry.register({
      name: 'danger',
      description: '',
      parameters: z.object({ a: z.number() }),
      execute: executor,
      requiresApproval: true,
    })
    // 合法参数，但没有 approve 权限
    const result = await registry.execute({ name: 'danger', arguments: { a: 1 } })

    expect(result.error).toMatch(/approval/)
    expect(result.error).not.toMatch(/parameter validation/)
  })
})

describe('Stage 03 教程模式 2: 防线 3 - 业务级防护（路径遍历）', () => {
  let tempDir: string
  let outsideFile: string

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'stage03-test-'))
    await writeFile(join(tempDir, 'allowed.txt'), 'inside content')
    // 在 baseDir 之外放一个文件，模拟 /etc/passwd
    outsideFile = join(tmpdir(), `stage03-outside-${Date.now()}.txt`)
    await writeFile(outsideFile, 'SECRET')
  })

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true })
    await rm(outsideFile, { force: true })
  })

  it('read_file 内的文件可以读', async () => {
    const registry = new ToolRegistry({
      permissions: ['approve'],
      metadata: { readFileBaseDir: tempDir },
    })
    registry.register(readFileTool)

    const result = await registry.execute({
      name: 'read_file',
      arguments: { path: 'allowed.txt' },
    })

    expect(result.error).toBeUndefined()
    expect(result.content).toBe('inside content')
  })

  it('试图通过 ../ 跳出 baseDir 的攻击会被拦截', async () => {
    const registry = new ToolRegistry({
      permissions: ['approve'],
      metadata: { readFileBaseDir: tempDir },
    })
    registry.register(readFileTool)

    const result = await registry.execute({
      name: 'read_file',
      arguments: { path: `../${outsideFile.split('/').pop()}` },
    })

    expect(result.error).toMatch(/outside the allowed base dir/)
    expect(result.content).toBe('')
  })
})

// ============================================================================
// LLM 协议序列化（教程模式 3）
// ============================================================================

describe('Stage 03 教程模式 3: 内置工具能转出合法的 OpenAI tools schema', () => {
  it('每个内置工具都有 type / function.name / function.parameters', () => {
    const registry = new ToolRegistry({ permissions: ['approve'] })
    registry.registerAll(builtinTools)
    const schemas = registry.toLLMFormat()

    expect(schemas.length).toBe(builtinTools.length)
    for (const s of schemas) {
      expect(s.type).toBe('function')
      expect(typeof s.function.name).toBe('string')
      expect(typeof s.function.description).toBe('string')
      expect(typeof s.function.parameters).toBe('object')
    }
  })

  it('requiresApproval 工具会在 description 里提示，给模型一个信号', () => {
    const registry = new ToolRegistry({ permissions: ['approve'] })
    registry.registerAll(builtinTools)
    const readFileSchema = registry
      .toLLMFormat()
      .find((s) => s.function.name === 'read_file')

    expect(readFileSchema?.function.description).toMatch(/requires approval/)
  })
})

