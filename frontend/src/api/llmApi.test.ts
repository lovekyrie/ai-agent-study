import type { LLMStreamEvent } from './llmApi'
import { describe, expect, it } from 'vitest'
import { SSEEventParser } from './llmApi'

function frame(event: string, data: LLMStreamEvent): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

describe('sSEEventParser', () => {
  it('parses a single complete frame', () => {
    const parser = new SSEEventParser<LLMStreamEvent>()
    const frames = parser.push(frame('token', {
      type: 'token',
      runId: 'run-1',
      delta: 'hello',
    }))

    expect(frames).toEqual([
      {
        event: 'token',
        data: {
          type: 'token',
          runId: 'run-1',
          delta: 'hello',
        },
      },
    ])
  })

  it('parses multiple frames in one network chunk', () => {
    const parser = new SSEEventParser<LLMStreamEvent>()
    const frames = parser.push(
      frame('token', { type: 'token', runId: 'run-1', delta: 'Hel' })
      + frame('final', {
        type: 'final',
        runId: 'run-1',
        content: 'Hello',
        metadata: {
          model: 'test-model',
          elapsedMs: 42,
        },
      }),
    )

    expect(frames).toHaveLength(2)
    expect(frames[0]?.data).toEqual({ type: 'token', runId: 'run-1', delta: 'Hel' })
    expect(frames[1]?.data).toEqual({
      type: 'final',
      runId: 'run-1',
      content: 'Hello',
      metadata: {
        model: 'test-model',
        elapsedMs: 42,
      },
    })
  })

  it('parses a frame split across network chunks', () => {
    const parser = new SSEEventParser<LLMStreamEvent>()
    const raw = frame('token', { type: 'token', runId: 'run-1', delta: 'split' })

    expect(parser.push(raw.slice(0, 12))).toEqual([])
    expect(parser.push(raw.slice(12))).toEqual([
      {
        event: 'token',
        data: {
          type: 'token',
          runId: 'run-1',
          delta: 'split',
        },
      },
    ])
  })

  it('parses token, final, and error event payloads', () => {
    const parser = new SSEEventParser<LLMStreamEvent>()
    const frames = parser.push(
      frame('token', { type: 'token', runId: 'run-1', delta: 'a' })
      + frame('final', {
        type: 'final',
        runId: 'run-1',
        content: 'a',
        metadata: {
          model: 'test-model',
          elapsedMs: 7,
        },
      })
      + frame('error', {
        type: 'error',
        runId: 'run-2',
        message: 'failed',
        recoverable: false,
      }),
    )

    expect(frames.map(item => item.data.type)).toEqual(['token', 'final', 'error'])
    expect(frames[2]?.data).toEqual({
      type: 'error',
      runId: 'run-2',
      message: 'failed',
      recoverable: false,
    })
  })
})
