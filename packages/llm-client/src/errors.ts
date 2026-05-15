import axios from 'axios'

const MAX_RESPONSE_PAYLOAD_LENGTH = 500

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'LLMError'
  }
}

function truncate(text: string, max = MAX_RESPONSE_PAYLOAD_LENGTH): string {
  return text.length > max ? `${text.slice(0, max)}...` : text
}

export function toReadableError(error: unknown): LLMError {
  if (error instanceof LLMError) return error

  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    const responseData = error.response?.data as unknown

    if (status === 429) {
      return new LLMError('Rate limit exceeded. Please try again later.', status, error)
    }
    if (status === 401) {
      return new LLMError('Invalid API key. Please check your credentials.', status, error)
    }
    if (status === 500) {
      return new LLMError('LLM service error. Please try again.', status, error)
    }

    let payload = ''
    if (responseData !== undefined) {
      // stream 模式下 responseData 是 ReadableStream，JSON.stringify 会得到 "{}"，跳过
      const isStream =
        typeof responseData === 'object' &&
        responseData !== null &&
        typeof (responseData as { pipe?: unknown }).pipe === 'function'
      if (!isStream) {
        try {
          payload = ` | response=${truncate(JSON.stringify(responseData))}`
        } catch {
          payload = ' | response=<unserializable>'
        }
      }
    }
    return new LLMError(
      `LLM request failed${status ? ` (HTTP ${status})` : ''}: ${error.message}${payload}`,
      status,
      error
    )
  }

  if (error instanceof Error) {
    return new LLMError(error.message, undefined, error)
  }

  return new LLMError(String(error))
}