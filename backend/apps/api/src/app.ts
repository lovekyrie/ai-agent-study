import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  StreamChunk,
} from '@ai-agent-study/llm-client'
import type { LLMStreamEvent } from '@ai-agent-study/server'
import type { ApiRuntimeConfig } from './config.js'
import { randomUUID } from 'node:crypto'
import { createLLMClientFromConfig } from '@ai-agent-study/llm-client'
import { encodeSSE } from '@ai-agent-study/server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { readApiConfig } from './config.js'

export interface LLMChatRequest {
  prompt: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
}

export interface LLMChatResponse {
  type: 'chat'
  runId: string
  content: string
  finishReason?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  model: string
  elapsedMs: number
}

export interface LLMClientLike {
  chat: (messages: ChatMessage[], options?: ChatOptions) => Promise<ChatResponse>
  stream: (messages: ChatMessage[], options?: ChatOptions) => AsyncIterable<StreamChunk>
}

export interface CreateApiAppOptions {
  config?: ApiRuntimeConfig
  llmClient?: LLMClientLike
  createLLMClient?: (config: ApiRuntimeConfig) => LLMClientLike
}

interface ApiErrorPayload {
  error: {
    code: string
    message: string
  }
}

const encoder = new TextEncoder()

function toApiError(error: unknown, code = 'LLM_REQUEST_FAILED'): ApiErrorPayload {
  return {
    error: {
      code,
      message: error instanceof Error ? error.message : String(error),
    },
  }
}

function missingApiKeyError(): ApiErrorPayload {
  return {
    error: {
      code: 'OPENAI_API_KEY_MISSING',
      message: 'OPENAI_API_KEY is not set. Add it to the server-side .env file before calling the LLM.',
    },
  }
}

function validateChatRequest(raw: unknown): { ok: true, value: LLMChatRequest } | { ok: false, message: string } {
  if (!raw || typeof raw !== 'object')
    return { ok: false, message: 'Request body must be a JSON object.' }

  const body = raw as Partial<LLMChatRequest>
  if (typeof body.prompt !== 'string' || body.prompt.trim().length === 0)
    return { ok: false, message: 'prompt is required.' }

  if (body.systemPrompt !== undefined && typeof body.systemPrompt !== 'string')
    return { ok: false, message: 'systemPrompt must be a string.' }

  if (body.temperature !== undefined) {
    if (typeof body.temperature !== 'number' || !Number.isFinite(body.temperature) || body.temperature < 0 || body.temperature > 2)
      return { ok: false, message: 'temperature must be a number between 0 and 2.' }
  }

  if (body.maxTokens !== undefined) {
    if (!Number.isInteger(body.maxTokens) || body.maxTokens < 1 || body.maxTokens > 200_000)
      return { ok: false, message: 'maxTokens must be an integer between 1 and 200000.' }
  }

  return {
    ok: true,
    value: {
      prompt: body.prompt,
      systemPrompt: body.systemPrompt,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
    },
  }
}

function createMessages(request: LLMChatRequest): ChatMessage[] {
  const messages: ChatMessage[] = []
  const systemPrompt = request.systemPrompt?.trim()
  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: systemPrompt,
    })
  }
  messages.push({
    role: 'user',
    content: request.prompt.trim(),
  })
  return messages
}

function createChatOptions(request: LLMChatRequest, signal: AbortSignal): ChatOptions {
  return {
    temperature: request.temperature,
    maxTokens: request.maxTokens,
    signal,
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  }
  catch {
    throw new Error('Request body must be valid JSON.')
  }
}

function writeSSE(controller: ReadableStreamDefaultController<Uint8Array>, event: LLMStreamEvent, id: number): void {
  controller.enqueue(encoder.encode(encodeSSE(event, String(id))))
}

export function createApiApp(options: CreateApiAppOptions = {}) {
  const config = options.config ?? readApiConfig()
  let llmClient = options.llmClient

  function hasApiKey(): boolean {
    return config.llm.apiKey.trim().length > 0
  }

  function getLLMClient(): LLMClientLike {
    if (!hasApiKey())
      throw new Error(missingApiKeyError().error.message)
    llmClient ??= options.createLLMClient?.(config) ?? createLLMClientFromConfig(config.llm)
    return llmClient
  }

  const app = new Hono()

  app.use('/api/*', cors({
    origin: config.frontendOrigin,
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  }))

  app.get('/api/health', (c) => {
    return c.json({
      status: 'ok',
      model: config.llm.model,
      hasApiKey: hasApiKey(),
    })
  })

  app.post('/api/llm/chat', async (c) => {
    let rawBody: unknown
    try {
      rawBody = await readJsonBody(c.req.raw)
    }
    catch (error) {
      return c.json(toApiError(error, 'BAD_REQUEST'), 400)
    }

    const parsed = validateChatRequest(rawBody)
    if (!parsed.ok)
      return c.json(toApiError(new Error(parsed.message), 'BAD_REQUEST'), 400)

    if (!hasApiKey())
      return c.json(missingApiKeyError(), 500)

    const runId = randomUUID()
    const startedAt = performance.now()

    try {
      const response = await getLLMClient().chat(
        createMessages(parsed.value),
        createChatOptions(parsed.value, c.req.raw.signal),
      )

      const payload: LLMChatResponse = {
        type: 'chat',
        runId,
        content: response.content,
        finishReason: response.finishReason,
        usage: response.usage,
        model: config.llm.model,
        elapsedMs: Math.round(performance.now() - startedAt),
      }

      return c.json(payload)
    }
    catch (error) {
      return c.json(toApiError(error), 500)
    }
  })

  app.post('/api/llm/stream', async (c) => {
    let rawBody: unknown
    try {
      rawBody = await readJsonBody(c.req.raw)
    }
    catch (error) {
      return c.json(toApiError(error, 'BAD_REQUEST'), 400)
    }

    const parsed = validateChatRequest(rawBody)
    if (!parsed.ok)
      return c.json(toApiError(new Error(parsed.message), 'BAD_REQUEST'), 400)

    const runId = randomUUID()
    const startedAt = performance.now()
    const signal = c.req.raw.signal
    const messages = createMessages(parsed.value)
    const chatOptions = createChatOptions(parsed.value, signal)

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let eventId = 0
        let content = ''

        try {
          if (!hasApiKey()) {
            writeSSE(controller, {
              type: 'error',
              runId,
              message: missingApiKeyError().error.message,
              recoverable: true,
            }, ++eventId)
            return
          }

          for await (const chunk of getLLMClient().stream(messages, chatOptions)) {
            if (signal.aborted)
              return
            if (chunk.done)
              break
            if (!chunk.delta)
              continue

            content += chunk.delta
            writeSSE(controller, {
              type: 'token',
              runId,
              delta: chunk.delta,
            }, ++eventId)
          }

          if (signal.aborted)
            return

          writeSSE(controller, {
            type: 'final',
            runId,
            content,
            metadata: {
              model: config.llm.model,
              elapsedMs: Math.round(performance.now() - startedAt),
            },
          }, ++eventId)
        }
        catch (error) {
          if (!signal.aborted) {
            writeSSE(controller, {
              type: 'error',
              runId,
              message: error instanceof Error ? error.message : String(error),
              recoverable: false,
            }, ++eventId)
          }
        }
        finally {
          controller.close()
        }
      },
      cancel() {
        // The request signal is passed into the LLM client; cancellation is handled upstream.
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    })
  })

  return app
}
