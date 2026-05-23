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
  usage?: TokenUsage
  model: string
  elapsedMs: number
}

export interface HealthResponse {
  status: string
  model: string
  hasApiKey: boolean
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type LLMStreamEvent
  = | { type: 'token', runId: string, delta: string }
    | { type: 'final', runId: string, content: string, metadata: { model: string, elapsedMs: number } }
    | { type: 'error', runId: string, message: string, recoverable: boolean }

interface ApiErrorPayload {
  error?: {
    code?: string
    message?: string
  }
}

export interface StreamChatOptions {
  signal?: AbortSignal
  onEvent: (event: LLMStreamEvent) => void
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

export interface ParsedSSEFrame<T> {
  event: string
  data: T
}

export class SSEEventParser<T> {
  private buffer = ''

  push(chunk: string): ParsedSSEFrame<T>[] {
    this.buffer += chunk.replace(/\r\n/g, '\n')
    return this.drainCompleteFrames()
  }

  flush(): ParsedSSEFrame<T>[] {
    if (!this.buffer.trim())
      return []
    const frame = this.parseFrame(this.buffer)
    this.buffer = ''
    return frame ? [frame] : []
  }

  private drainCompleteFrames(): ParsedSSEFrame<T>[] {
    const frames: ParsedSSEFrame<T>[] = []

    while (true) {
      const boundary = this.buffer.indexOf('\n\n')
      if (boundary === -1)
        break

      const rawFrame = this.buffer.slice(0, boundary)
      this.buffer = this.buffer.slice(boundary + 2)

      const frame = this.parseFrame(rawFrame)
      if (frame)
        frames.push(frame)
    }

    return frames
  }

  private parseFrame(rawFrame: string): ParsedSSEFrame<T> | null {
    let event = 'message'
    const dataLines: string[] = []

    for (const line of rawFrame.split('\n')) {
      if (!line || line.startsWith(':'))
        continue

      if (line.startsWith('event:')) {
        event = line.slice(6).trim()
        continue
      }

      if (line.startsWith('data:'))
        dataLines.push(line.slice(5).trimStart())
    }

    if (!dataLines.length)
      return null

    return {
      event,
      data: JSON.parse(dataLines.join('\n')) as T,
    }
  }
}

async function parseApiError(response: Response): Promise<ApiRequestError> {
  try {
    const payload = await response.json() as ApiErrorPayload
    return new ApiRequestError(
      payload.error?.message || `Request failed with status ${response.status}`,
      response.status,
      payload.error?.code,
    )
  }
  catch {
    return new ApiRequestError(`Request failed with status ${response.status}`, response.status)
  }
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal })
  if (!response.ok)
    throw await parseApiError(response)
  return await response.json() as HealthResponse
}

export async function chat(request: LLMChatRequest, signal?: AbortSignal): Promise<LLMChatResponse> {
  const response = await fetch('/api/llm/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  })

  if (!response.ok)
    throw await parseApiError(response)

  return await response.json() as LLMChatResponse
}

export async function streamChat(request: LLMChatRequest, options: StreamChatOptions): Promise<void> {
  const response = await fetch('/api/llm/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: options.signal,
  })

  if (!response.ok)
    throw await parseApiError(response)

  if (!response.body)
    throw new ApiRequestError('Streaming response body is empty.', response.status)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parser = new SSEEventParser<LLMStreamEvent>()

  while (true) {
    const { value, done } = await reader.read()
    if (done)
      break

    const text = decoder.decode(value, { stream: true })
    for (const frame of parser.push(text))
      options.onEvent(frame.data)
  }

  const tail = decoder.decode()
  for (const frame of parser.push(tail))
    options.onEvent(frame.data)
  for (const frame of parser.flush())
    options.onEvent(frame.data)
}
