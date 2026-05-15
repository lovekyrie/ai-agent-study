import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'
import axios from 'axios'
import { LLMClient } from '../src/client.js'
import { LLMError, toReadableError } from '../src/errors.js'
import type { ChatMessage } from '../src/types.js'

vi.mock('axios')
const mockedAxios = vi.mocked(axios)

function createClientWithPostMock(
  postMock: ReturnType<typeof vi.fn>,
  overrides?: Partial<{ maxRetries: number }>
) {
  mockedAxios.create.mockReturnValue({
    post: postMock,
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    defaults: {},
  } as never)
  return new LLMClient({
    apiKey: 'test-key',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    maxRetries: overrides?.maxRetries ?? 0,
  })
}

describe('LLMClient.chat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // axios.isAxiosError 在测试里需要单独 mock
    mockedAxios.isAxiosError = ((err: unknown) =>
      Boolean((err as { isAxiosError?: boolean })?.isAxiosError)) as never
  })

  it('returns parsed chat response with usage (snake_case → camelCase)', async () => {
    const postMock = vi.fn().mockResolvedValue({
      data: {
        choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
    })
    const client = createClientWithPostMock(postMock)

    const messages: ChatMessage[] = [{ role: 'user', content: 'Hi' }]
    const response = await client.chat(messages)

    expect(response.content).toBe('Hello')
    expect(response.finishReason).toBe('stop')
    expect(response.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 })
    expect(postMock).toHaveBeenCalledTimes(1)
  })

  it('passes response_format when jsonMode is true', async () => {
    const postMock = vi.fn().mockResolvedValue({
      data: { choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] },
    })
    const client = createClientWithPostMock(postMock)
    await client.chat([{ role: 'user', content: 'x' }], { jsonMode: true })
    expect(postMock.mock.calls[0][1]).toMatchObject({
      response_format: { type: 'json_object' },
    })
  })

  it('retries on 429 then succeeds', async () => {
    const rateLimitError = Object.assign(new Error('429'), {
      isAxiosError: true,
      response: { status: 429 },
    })
    const postMock = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValue({
        data: { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] },
      })
    const client = createClientWithPostMock(postMock, { maxRetries: 2 })

    // 替换 sleep 避免真实等待
    vi.spyOn(global, 'setTimeout').mockImplementation(
      ((cb: () => void) => {
        cb()
        return 0 as unknown as NodeJS.Timeout
      }) as never
    )

    const response = await client.chat([{ role: 'user', content: 'x' }])
    expect(response.content).toBe('ok')
    expect(postMock).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry on 401 (auth error)', async () => {
    const authError = Object.assign(new Error('401'), {
      isAxiosError: true,
      response: { status: 401 },
    })
    const postMock = vi.fn().mockRejectedValue(authError)
    const client = createClientWithPostMock(postMock, { maxRetries: 3 })

    await expect(client.chat([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(LLMError)
    expect(postMock).toHaveBeenCalledTimes(1)
  })

  it('jsonStructured parses content; throws on invalid JSON', async () => {
    const okPost = vi.fn().mockResolvedValue({
      data: { choices: [{ message: { content: '{"a":1}' }, finish_reason: 'stop' }] },
    })
    const okClient = createClientWithPostMock(okPost)
    await expect(okClient.jsonStructured<{ a: number }>([])).resolves.toEqual({ a: 1 })

    const badPost = vi.fn().mockResolvedValue({
      data: { choices: [{ message: { content: 'not-json' }, finish_reason: 'stop' }] },
    })
    const badClient = createClientWithPostMock(badPost)
    await expect(badClient.jsonStructured([])).rejects.toThrow(/Failed to parse/)
  })
})

describe('LLMClient.stream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedAxios.isAxiosError = ((err: unknown) =>
      Boolean((err as { isAxiosError?: boolean })?.isAxiosError)) as never
  })

  it('parses SSE stream across chunk boundaries', async () => {
    // 关键场景：data 行跨 chunk 边界
    const stream = Readable.from([
      'data: {"choices":[{"delta":{"content":"He"}}]}\n',
      'data: {"choices":[{"delta":{"content":"llo"}}',
      ']}\n',
      'data: [DONE]\n',
    ])
    const postMock = vi.fn().mockResolvedValue({ data: stream })
    const client = createClientWithPostMock(postMock)

    const chunks: string[] = []
    for await (const c of client.stream([{ role: 'user', content: 'hi' }])) {
      if (!c.done) chunks.push(c.delta)
    }
    expect(chunks.join('')).toBe('Hello')
  })

  it('ignores malformed JSON lines silently', async () => {
    const stream = Readable.from([
      'data: not-json\n',
      'data: {"choices":[{"delta":{"content":"x"}}]}\n',
      'data: [DONE]\n',
    ])
    const postMock = vi.fn().mockResolvedValue({ data: stream })
    const client = createClientWithPostMock(postMock)

    let out = ''
    for await (const c of client.stream([])) if (!c.done) out += c.delta
    expect(out).toBe('x')
  })
})

describe('SSE static parser', () => {
  it('parses [DONE]', () => {
    expect(LLMClient.parseSSE('data: [DONE]')).toEqual({ delta: '', done: true })
  })
  it('parses content delta', () => {
    expect(
      LLMClient.parseSSE('data: {"choices":[{"delta":{"content":"hello"}}]}')
    ).toEqual({ delta: 'hello', done: false })
  })
  it('returns null for invalid line', () => {
    expect(LLMClient.parseSSE('invalid')).toBeNull()
  })
  it('tolerates "data:" without space', () => {
    expect(
      LLMClient.parseSSE('data:{"choices":[{"delta":{"content":"a"}}]}')
    ).toEqual({ delta: 'a', done: false })
  })
})

describe('LLMError / toReadableError', () => {
  it('preserves status and name', () => {
    const error = new LLMError('Test error', 500)
    expect(error.name).toBe('LLMError')
    expect(error.message).toBe('Test error')
    expect(error.status).toBe(500)
  })

  it('maps 429 to friendly rate-limit message', () => {
    mockedAxios.isAxiosError = (() => true) as never
    const err = { isAxiosError: true, response: { status: 429 }, message: 'rl' }
    const wrapped = toReadableError(err)
    expect(wrapped.status).toBe(429)
    expect(wrapped.message).toMatch(/rate limit/i)
  })

  it('truncates long response payloads in error message', () => {
    mockedAxios.isAxiosError = (() => true) as never
    const huge = 'x'.repeat(2000)
    const err = {
      isAxiosError: true,
      response: { status: 400, data: { msg: huge } },
      message: 'bad',
    }
    const wrapped = toReadableError(err)
    expect(wrapped.message.length).toBeLessThan(1000)
    expect(wrapped.message).toMatch(/\.\.\./)
  })
})
