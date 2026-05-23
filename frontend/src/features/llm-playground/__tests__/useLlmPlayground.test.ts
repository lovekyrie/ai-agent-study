import type { LLMChatRequest, LLMChatResponse } from '../../../api/llmApi'
import type { LlmPlaygroundApi } from '../types'
import { describe, expect, it } from 'vitest'
import { useLlmPlayground } from '../composables/useLlmPlayground'

function createFakeApi(overrides: Partial<LlmPlaygroundApi> = {}): LlmPlaygroundApi {
  return {
    async getHealth() {
      return {
        model: 'test-model',
        hasApiKey: true,
      }
    },
    async chat(): Promise<LLMChatResponse> {
      return {
        type: 'chat',
        runId: 'run-1',
        content: 'chat answer',
        finishReason: 'stop',
        usage: {
          promptTokens: 4,
          completionTokens: 2,
          totalTokens: 6,
        },
        model: 'test-model',
        elapsedMs: 31,
      }
    },
    async streamChat(_request, options) {
      options.onEvent({ type: 'token', runId: 'run-1', delta: 'Hel' })
      options.onEvent({ type: 'token', runId: 'run-1', delta: 'lo' })
      options.onEvent({
        type: 'final',
        runId: 'run-1',
        content: 'Hello',
        metadata: {
          model: 'test-model',
          elapsedMs: 44,
        },
      })
    },
    ...overrides,
  }
}

describe('useLlmPlayground', () => {
  it('updates final content and metadata for normal chat calls', async () => {
    const seenRequests: LLMChatRequest[] = []
    const playground = useLlmPlayground(createFakeApi({
      async chat(request) {
        seenRequests.push(request)
        return {
          type: 'chat',
          runId: 'run-1',
          content: 'normal response',
          finishReason: 'stop',
          usage: {
            promptTokens: 5,
            completionTokens: 6,
            totalTokens: 11,
          },
          model: 'test-model',
          elapsedMs: 50,
        }
      },
    }))

    playground.updateField('prompt', 'Hello')
    await playground.runChat()

    expect(seenRequests[0]?.prompt).toBe('Hello')
    expect(playground.mode.value).toBe('chat')
    expect(playground.status.value).toBe('done')
    expect(playground.content.value).toBe('normal response')
    expect(playground.metadata.value).toEqual({
      model: 'test-model',
      elapsedMs: 50,
      usage: {
        promptTokens: 5,
        completionTokens: 6,
        totalTokens: 11,
      },
    })
  })

  it('appends streaming tokens and chunk timeline entries', async () => {
    const playground = useLlmPlayground(createFakeApi())

    playground.updateField('prompt', 'Stream')
    await playground.runStream()

    expect(playground.mode.value).toBe('stream')
    expect(playground.status.value).toBe('done')
    expect(playground.content.value).toBe('Hello')
    expect(playground.metadata.value).toEqual({
      model: 'test-model',
      elapsedMs: 44,
    })
    expect(playground.chunks.value).toHaveLength(2)
    expect(playground.chunks.value[0]).toMatchObject({
      index: 1,
      delta: 'Hel',
      accumulatedChars: 3,
    })
    expect(playground.chunks.value[1]).toMatchObject({
      index: 2,
      delta: 'lo',
      accumulatedChars: 5,
    })
  })

  it('stop aborts the active request and restores operable state', async () => {
    let seenSignal: AbortSignal | undefined
    const playground = useLlmPlayground(createFakeApi({
      async chat(_request, signal) {
        seenSignal = signal
        return await new Promise<LLMChatResponse>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      },
    }))

    playground.updateField('prompt', 'Abort')
    const pending = playground.runChat()
    expect(playground.status.value).toBe('running')

    playground.stop()
    await pending

    expect(seenSignal?.aborted).toBe(true)
    expect(playground.status.value).toBe('aborted')
    expect(playground.isRunning.value).toBe(false)
    expect(playground.canSubmit.value).toBe(true)
  })
})
