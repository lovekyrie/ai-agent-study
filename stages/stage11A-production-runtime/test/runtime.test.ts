import { describe, expect, it } from 'vitest'
import { renderStreamingResponse, runStreamingAgent } from '../src/index.js'

describe('stage11A production runtime', () => {
  it('emits retrieval, tool, token and final events', async () => {
    const events = []
    for await (const event of runStreamingAgent('run-1', 'rag')) events.push(event.type)
    expect(events).toEqual(['retrieval', 'tool_call', 'token', 'token', 'token', 'final'])
  })

  it('renders events as SSE frames', async () => {
    const response = await renderStreamingResponse('run-1', 'rag')
    expect(response).toContain('event: retrieval')
    expect(response).toContain('event: final')
  })
})
