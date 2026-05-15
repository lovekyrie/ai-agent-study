import axios, { type AxiosInstance } from 'axios'
import { toReadableError } from './errors.js'
import type {
  LLMConfig,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  StreamChunk,
  ToolCall,
} from './types.js'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 指数退避 + 抖动，避免雷暴
function backoffDelay(attempt: number): number {
  const base = Math.min(1000 * 2 ** attempt, 30_000)
  return base + Math.random() * 200
}

interface ResolvedOptions {
  temperature: number
  topP: number
  maxTokens: number
  jsonMode: boolean
  tools: ChatOptions['tools']
  signal?: AbortSignal
}

export class LLMClient {
  private client: AxiosInstance
  private model: string
  private defaults: { temperature: number; topP: number; maxTokens: number }
  private maxRetries: number

  constructor(config: LLMConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: config.timeout ?? 120_000,
    })
    this.model = config.model
    this.maxRetries = config.maxRetries ?? 3
    this.defaults = {
      temperature: config.temperature ?? 0.7,
      topP: config.topP ?? 1.0,
      maxTokens: config.maxTokens ?? 1000,
    }
  }

  private resolveOptions(options?: ChatOptions): ResolvedOptions {
    return {
      temperature: options?.temperature ?? this.defaults.temperature,
      topP: options?.topP ?? this.defaults.topP,
      maxTokens: options?.maxTokens ?? this.defaults.maxTokens,
      jsonMode: options?.jsonMode ?? false,
      tools: options?.tools,
      signal: options?.signal,
    }
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const opts = this.resolveOptions(options)

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.doChat(messages, opts)
      } catch (error) {
        if (attempt < this.maxRetries && this.isRetryable(error)) {
          await sleep(backoffDelay(attempt))
          continue
        }
        throw toReadableError(error)
      }
    }
    // 理论上不可达
    throw new Error('Max retries exceeded')
  }

  private async doChat(messages: ChatMessage[], opts: ResolvedOptions): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: opts.temperature,
      top_p: opts.topP,
      max_tokens: opts.maxTokens,
      stream: false,
    }

    if (opts.jsonMode) body.response_format = { type: 'json_object' }
    if (opts.tools?.length) {
      body.tools = opts.tools
      body.tool_choice = 'auto'
    }

    const response = await this.client.post('/chat/completions', body, {
      signal: opts.signal,
    })
    const choice = response.data?.choices?.[0]
    if (!choice) {
      throw new Error('LLM API returned an unexpected response payload')
    }

    const message = choice.message
    const toolCalls = parseToolCalls(message?.tool_calls)

    return {
      content: message?.content ?? '',
      toolCalls,
      finishReason: choice.finish_reason as ChatResponse['finishReason'],
      usage: response.data?.usage
        ? {
            promptTokens: response.data.usage.prompt_tokens,
            completionTokens: response.data.usage.completion_tokens,
            totalTokens: response.data.usage.total_tokens,
          }
        : undefined,
    }
  }

  async *stream(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk, void, undefined> {
    const opts = this.resolveOptions(options)

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        yield* this.doStream(messages, opts)
        return
      } catch (error) {
        if (attempt < this.maxRetries && this.isRetryable(error)) {
          await sleep(backoffDelay(attempt))
          continue
        }
        throw toReadableError(error)
      }
    }
    throw new Error('Max retries exceeded in stream')
  }

  private async *doStream(
    messages: ChatMessage[],
    opts: ResolvedOptions
  ): AsyncGenerator<StreamChunk, void, undefined> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: opts.temperature,
      top_p: opts.topP,
      max_tokens: opts.maxTokens,
      stream: true,
    }
    if (opts.tools?.length) body.tools = opts.tools

    const response = await this.client.post('/chat/completions', body, {
      responseType: 'stream',
      headers: { Accept: 'text/event-stream' },
      signal: opts.signal,
    })

    const stream = response.data as NodeJS.ReadableStream & { destroy?: () => void }
    let buffer = ''

    try {
      for await (const chunk of stream) {
        buffer += (chunk as Buffer).toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const parsed = LLMClient.parseSSE(line)
          if (!parsed) continue
          if (parsed.done) {
            yield parsed
            return
          }
          if (parsed.delta) yield parsed
        }
      }

      // 处理 buffer 末尾残留（流提前关闭时可能没有 trailing \n）
      const tail = LLMClient.parseSSE(buffer)
      if (tail) {
        if (tail.done) {
          yield tail
          return
        }
        if (tail.delta) yield tail
      }

      yield { delta: '', done: true }
    } finally {
      stream.destroy?.()
    }
  }

  async jsonStructured<T = Record<string, unknown>>(
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<T> {
    const response = await this.chat(messages, { ...options, jsonMode: true })
    try {
      return JSON.parse(response.content) as T
    } catch {
      throw new Error('Failed to parse structured JSON response')
    }
  }

  /** 解析一行 SSE，容忍 "data:" 后是否带空格 */
  static parseSSE(line: string): StreamChunk | null {
    if (!line || !line.startsWith('data:')) return null
    const data = line.slice(5).trimStart()
    if (data === '[DONE]') return { delta: '', done: true }
    try {
      const parsed = JSON.parse(data)
      return { delta: parsed.choices?.[0]?.delta?.content ?? '', done: false }
    } catch {
      return null
    }
  }

  private isRetryable(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      return status === 429 || (status != null && status >= 500)
    }
    return false
  }
}

function parseToolCalls(rawToolCalls: unknown): ToolCall[] | undefined {
  if (!Array.isArray(rawToolCalls)) return undefined
  return rawToolCalls.map((tc) => {
    const t = tc as { id?: string; function?: { name?: string; arguments?: string } }
    return {
      id: t.id ?? '',
      type: 'function' as const,
      function: {
        name: t.function?.name ?? '',
        arguments: t.function?.arguments ?? '',
      },
    }
  })
}
