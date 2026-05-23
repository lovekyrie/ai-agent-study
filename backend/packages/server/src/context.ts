import type { RequestContext } from './types.js'

export function parseBearerToken(header?: string): string | undefined {
  if (!header)
    return undefined
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]
}

export function createRequestContext(headers: Record<string, string | undefined>): RequestContext {
  const requestId = headers['x-request-id'] ?? `req_${Math.random().toString(36).slice(2, 10)}`
  return {
    requestId,
    sessionId: headers['x-session-id'],
    userId: headers['x-user-id'],
    traceId: headers.traceparent ?? requestId,
  }
}
