import type { ChatMessage, ChatOptions, ChatResponse, StreamChunk } from '@ai-agent-study/llm-client'
import type { ApiRuntimeConfig, LLMClientLike } from '../src/public.js'
import { describe, expect, it } from 'vitest'
import { createApiApp } from '../src/public.js'

const baseConfig: ApiRuntimeConfig = {
  port: 3000,
  frontendOrigin: 'http://localhost:5173',
  llm: {
    apiKey: 'test-key',
    baseURL: 'https://example.test/v1',
    model: 'test-model',
    temperature: 0.7,
    maxTokens: 1000,
  },
}

function jsonRequest(path: string, body: unknown, init: RequestInit = {}): Request {
  return new Request(`http://localhost${path}`, {
    ...init,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
    body: JSON.stringify(body),
  })
}

function createFakeClient(overrides: Partial<LLMClientLike> = {}): LLMClientLike {
  return {
    async chat(): Promise<ChatResponse> {
      return {
        content: 'Hello from chat',
        finishReason: 'stop',
        usage: {
          promptTokens: 4,
          completionTokens: 3,
          totalTokens: 7,
        },
      }
    },
    async* stream(): AsyncGenerator<StreamChunk> {
      yield { delta: 'Hel', done: false }
      yield { delta: 'lo', done: false }
      yield { delta: '', done: true }
    },
    ...overrides,
  }
}

async function readJson<T>(response: Response): Promise<T> {
  return await response.json() as T
}

describe('api app', () => {
  it('reports health without leaking the API key', async () => {
    const app = createApiApp({
      config: baseConfig,
      llmClient: createFakeClient(),
    })

    const response = await app.fetch(new Request('http://localhost/api/health'))
    const payload = await readJson<Record<string, unknown>>(response)

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      status: 'ok',
      model: 'test-model',
      hasApiKey: true,
    })
    expect(JSON.stringify(payload)).not.toContain('test-key')
  })

  it('returns 400 when chat prompt is empty', async () => {
    const app = createApiApp({
      config: baseConfig,
      llmClient: createFakeClient(),
    })

    const response = await app.fetch(jsonRequest('/api/llm/chat', { prompt: '   ' }))
    const payload = await readJson<{ error: { code: string, message: string } }>(response)

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe('BAD_REQUEST')
    expect(payload.error.message).toContain('prompt')
  })

  it('returns chat content and metadata from the LLM client', async () => {
    let seenMessages: ChatMessage[] = []
    let seenOptions: ChatOptions | undefined
    const app = createApiApp({
      config: baseConfig,
      llmClient: createFakeClient({
        async chat(messages, options) {
          seenMessages = messages
          seenOptions = options
          return {
            content: 'A complete answer',
            finishReason: 'stop',
            usage: {
              promptTokens: 8,
              completionTokens: 5,
              totalTokens: 13,
            },
          }
        },
      }),
    })

    const controller = new AbortController()
    const response = await app.fetch(jsonRequest('/api/llm/chat', {
      systemPrompt: 'Be brief',
      prompt: 'Say hi',
      temperature: 0.2,
      maxTokens: 64,
    }, { signal: controller.signal }))
    const payload = await readJson<Record<string, unknown>>(response)

    expect(response.status).toBe(200)
    expect(payload.type).toBe('chat')
    expect(payload.runId).toEqual(expect.any(String))
    expect(payload.content).toBe('A complete answer')
    expect(payload.model).toBe('test-model')
    expect(payload.elapsedMs).toEqual(expect.any(Number))
    expect(payload.usage).toEqual({
      promptTokens: 8,
      completionTokens: 5,
      totalTokens: 13,
    })
    expect(seenMessages).toEqual([
      { role: 'system', content: 'Be brief' },
      { role: 'user', content: 'Say hi' },
    ])
    expect(seenOptions?.temperature).toBe(0.2)
    expect(seenOptions?.maxTokens).toBe(64)
    expect(seenOptions?.signal).toBeInstanceOf(AbortSignal)
    expect(seenOptions?.signal?.aborted).toBe(false)
  })

  it('returns structured errors when chat fails', async () => {
    const app = createApiApp({
      config: baseConfig,
      llmClient: createFakeClient({
        async chat() {
          throw new Error('provider failed')
        },
      }),
    })

    const response = await app.fetch(jsonRequest('/api/llm/chat', { prompt: 'hello' }))
    const payload = await readJson<{ error: { code: string, message: string } }>(response)

    expect(response.status).toBe(500)
    expect(payload.error).toEqual({
      code: 'LLM_REQUEST_FAILED',
      message: 'provider failed',
    })
  })

  it('streams token and final SSE events', async () => {
    const app = createApiApp({
      config: baseConfig,
      llmClient: createFakeClient(),
    })

    const response = await app.fetch(jsonRequest('/api/llm/stream', { prompt: 'hello' }))
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(text).toContain('event: token')
    expect(text).toContain('"delta":"Hel"')
    expect(text).toContain('"delta":"lo"')
    expect(text).toContain('event: final')
    expect(text).toContain('"content":"Hello"')
    expect(text).toContain('"model":"test-model"')
  })

  it('streams error SSE events when stream fails', async () => {
    const app = createApiApp({
      config: baseConfig,
      llmClient: createFakeClient({
        async* stream() {
          yield { delta: 'partial', done: false }
          throw new Error('stream failed')
        },
      }),
    })

    const response = await app.fetch(jsonRequest('/api/llm/stream', { prompt: 'hello' }))
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(text).toContain('event: token')
    expect(text).toContain('event: error')
    expect(text).toContain('"message":"stream failed"')
    expect(text).not.toContain('event: final')
  })

  it('returns clear errors when OPENAI_API_KEY is not configured', async () => {
    const app = createApiApp({
      config: {
        ...baseConfig,
        llm: {
          ...baseConfig.llm,
          apiKey: '',
        },
      },
      llmClient: createFakeClient(),
    })

    const health = await readJson<Record<string, unknown>>(
      await app.fetch(new Request('http://localhost/api/health')),
    )
    expect(health.hasApiKey).toBe(false)

    const chatResponse = await app.fetch(jsonRequest('/api/llm/chat', { prompt: 'hello' }))
    const chatPayload = await readJson<{ error: { code: string, message: string } }>(chatResponse)
    expect(chatResponse.status).toBe(500)
    expect(chatPayload.error.code).toBe('OPENAI_API_KEY_MISSING')
    expect(chatPayload.error.message).toContain('OPENAI_API_KEY')

    const streamResponse = await app.fetch(jsonRequest('/api/llm/stream', { prompt: 'hello' }))
    const streamText = await streamResponse.text()
    expect(streamText).toContain('event: error')
    expect(streamText).toContain('OPENAI_API_KEY')
  })
})
