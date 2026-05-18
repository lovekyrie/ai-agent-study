/**
 * Stage 01 教程级测试。
 *
 * 这里**不重复**测试 `packages/llm-client` 的内部实现（SSE 边界、重试细节
 * 已经在 packages/llm-client/test/client.test.ts 里覆盖了 14 个用例）。
 * 本文件只验证 stage README 中宣称的"三种调用模式"和"工厂行为"是否成立。
 *
 * 设计选择：用 duck-typed mock 替代 axios mock，这样 stage 不需要直接依赖 axios。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createLLMClient,
  LLMError,
  type ChatMessage,
  type ChatResponse,
  type LLMClient,
  type StreamChunk,
} from '@ai-agent-study/llm-client'

/** 构造一个最小可用的 LLMClient mock，按预设脚本逐轮返回。 */
function fakeClient(opts: {
  chatResponses?: ChatResponse[]
  streamChunks?: StreamChunk[]
  jsonResponses?: unknown[]
}) {
  let chatI = 0
  let jsonI = 0
  const calls: ChatMessage[][] = []
  const sentOptions: Array<Record<string, unknown> | undefined> = []

  const client = {
    chat: vi.fn(async (messages: ChatMessage[], options?: Record<string, unknown>) => {
      calls.push([...messages])
      sentOptions.push(options)
      const r = opts.chatResponses?.[chatI++]
      if (!r) throw new Error('mock ran out of chat responses')
      return r
    }),
    stream: vi.fn(async function* () {
      for (const c of opts.streamChunks ?? []) yield c
    }),
    jsonStructured: vi.fn(async () => {
      const r = opts.jsonResponses?.[jsonI++]
      if (r === undefined) throw new Error('mock ran out of json responses')
      return r
    }),
  } as unknown as LLMClient

  return { client, calls, sentOptions }
}

describe('Stage 01 教程模式 1: 非流式 chat()', () => {
  it('返回的字段与 README 中的示例一致（usage 是 camelCase）', async () => {
    const { client } = fakeClient({
      chatResponses: [
        {
          content: '你好',
          finishReason: 'stop',
          usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
        },
      ],
    })

    const response = await client.chat([
      { role: 'system', content: '你是一个助手。' },
      { role: 'user', content: '你好' },
    ])

    expect(response.content).toBe('你好')
    expect(response.finishReason).toBe('stop')
    expect(response.usage).toMatchObject({ promptTokens: 3, totalTokens: 5 })
  })

  it('能透传 jsonMode 等 options（教程中演示的覆盖工厂默认值）', async () => {
    const { client, sentOptions } = fakeClient({
      chatResponses: [{ content: '{}', finishReason: 'stop' }],
    })
    await client.chat([{ role: 'user', content: 'x' }], { jsonMode: true, maxTokens: 200 })
    expect(sentOptions[0]).toMatchObject({ jsonMode: true, maxTokens: 200 })
  })
})

describe('Stage 01 教程模式 2: 流式 stream()', () => {
  it('async iterator 累加得到完整文本，最后会拿到 done=true', async () => {
    const { client } = fakeClient({
      streamChunks: [
        { delta: '你', done: false },
        { delta: '好', done: false },
        { delta: '', done: true },
      ],
    })

    let collected = ''
    let sawDone = false
    for await (const chunk of client.stream([{ role: 'user', content: 'x' }])) {
      if (chunk.done) sawDone = true
      else collected += chunk.delta
    }
    expect(collected).toBe('你好')
    expect(sawDone).toBe(true)
  })
})

describe('Stage 01 教程模式 3: jsonStructured()', () => {
  it('返回的对象会被断言到泛型，调用方拿到的就是结构化数据', async () => {
    const { client } = fakeClient({
      jsonResponses: [{ language: 'ts', features: ['types'] }],
    })

    const result = await client.jsonStructured<{
      language: string
      features: string[]
    }>([{ role: 'user', content: '...' }])

    expect(result.language).toBe('ts')
    expect(result.features).toContain('types')
  })
})

describe('Stage 01 工厂 createLLMClient', () => {
  const ORIGINAL_ENV = { ...process.env }
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('缺少 API Key 时显式抛错（避免静默生成废客户端）', () => {
    delete process.env.OPENAI_API_KEY
    expect(() => createLLMClient()).toThrow(/OPENAI_API_KEY/)
  })

  it('用户传入 apiKey 时即使 env 缺失也能成功构造', () => {
    delete process.env.OPENAI_API_KEY
    expect(() => createLLMClient({ apiKey: 'override' })).not.toThrow()
  })
})

describe('Stage 01 错误模型: LLMError', () => {
  it('保留 status 让上层做差异化处理（教程中强调 401 不重试）', () => {
    const error = new LLMError('unauthorized', 401)
    expect(error.name).toBe('LLMError')
    expect(error.status).toBe(401)
    expect(error).toBeInstanceOf(Error)
  })

  it('5xx 错误也能携带 status', () => {
    const error = new LLMError('server boom', 503)
    expect(error.status).toBe(503)
  })
})
