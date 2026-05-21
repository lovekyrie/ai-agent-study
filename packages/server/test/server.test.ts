import { describe, expect, it } from 'vitest'
import { collectEventStream, createRequestContext, encodeSSE, parseBearerToken } from '../src/index.js'

describe('server streaming primitives', () => {
  it('encodes typed agent events as SSE frames', async () => {
    const frame = encodeSSE({ type: 'token', runId: 'run-1', delta: 'hello' }, '1')
    expect(frame).toContain('event: token')
    expect(frame).toContain('"delta":"hello"')

    const stream = await collectEventStream([
      { type: 'retrieval', runId: 'run-1', query: 'rag', hits: 2, sources: ['a.md'] },
      { type: 'final', runId: 'run-1', content: 'done' },
    ])
    expect(stream).toContain('event: retrieval')
    expect(stream).toContain('event: final')
  })

  it('creates request context and parses bearer tokens', () => {
    expect(parseBearerToken('Bearer abc')).toBe('abc')
    const ctx = createRequestContext({ 'x-request-id': 'req-1', 'x-session-id': 's1', 'x-user-id': 'u1' })
    expect(ctx).toEqual({ requestId: 'req-1', sessionId: 's1', userId: 'u1', traceId: 'req-1' })
  })
})
