import type { LLMChatRequest, LLMStreamEvent } from '../../../api/llmApi'
import type {
  ChunkLogItem,
  LlmPlaygroundApi,
  PlaygroundMode,
  PromptFormField,
  PromptFormState,
  RequestStatus,
  ResponseMetadata,
} from '../types'
import { computed, reactive, shallowRef } from 'vue'
import * as llmApi from '../../../api/llmApi'

const defaultApi: LlmPlaygroundApi = {
  chat: llmApi.chat,
  streamChat: llmApi.streamChat,
  getHealth: llmApi.getHealth,
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function useLlmPlayground(api: LlmPlaygroundApi = defaultApi) {
  const form = reactive<PromptFormState>({
    systemPrompt: 'You are a concise assistant.',
    prompt: 'Explain the difference between a non-streaming and streaming LLM response in one paragraph.',
    temperature: 0.7,
    maxTokens: 1000,
  })

  const mode = shallowRef<PlaygroundMode>('none')
  const status = shallowRef<RequestStatus>('idle')
  const content = shallowRef('')
  const error = shallowRef<string | null>(null)
  const metadata = shallowRef<ResponseMetadata | null>(null)
  const chunks = shallowRef<ChunkLogItem[]>([])
  const health = shallowRef<{ model: string, hasApiKey: boolean } | null>(null)
  const abortController = shallowRef<AbortController | null>(null)

  const isRunning = computed(() => status.value === 'running')
  const canSubmit = computed(() => form.prompt.trim().length > 0 && !isRunning.value)

  function updateField(field: PromptFormField, value: string | number): void {
    if (field === 'temperature' || field === 'maxTokens') {
      form[field] = Number(value)
      return
    }
    form[field] = String(value)
  }

  function toRequest(): LLMChatRequest {
    return {
      prompt: form.prompt,
      systemPrompt: form.systemPrompt,
      temperature: form.temperature,
      maxTokens: form.maxTokens,
    }
  }

  function resetOutput(nextMode: PlaygroundMode): AbortController {
    abortController.value?.abort()
    const controller = new AbortController()
    abortController.value = controller
    mode.value = nextMode
    status.value = 'running'
    content.value = ''
    error.value = null
    metadata.value = null
    chunks.value = []
    return controller
  }

  function finishRequest(controller: AbortController): void {
    if (abortController.value === controller)
      abortController.value = null
  }

  function handleRequestError(controller: AbortController, requestError: unknown): void {
    if (controller.signal.aborted || isAbortError(requestError)) {
      status.value = 'aborted'
      error.value = null
      return
    }

    status.value = 'error'
    error.value = requestError instanceof Error ? requestError.message : String(requestError)
  }

  async function loadHealth(): Promise<void> {
    try {
      health.value = await api.getHealth()
    }
    catch (healthError) {
      error.value = healthError instanceof Error ? healthError.message : String(healthError)
    }
  }

  async function runChat(): Promise<void> {
    if (!canSubmit.value)
      return

    const controller = resetOutput('chat')

    try {
      const response = await api.chat(toRequest(), controller.signal)
      if (controller.signal.aborted)
        return

      content.value = response.content
      metadata.value = {
        model: response.model,
        elapsedMs: response.elapsedMs,
        usage: response.usage,
      }
      status.value = 'done'
    }
    catch (requestError) {
      handleRequestError(controller, requestError)
    }
    finally {
      finishRequest(controller)
    }
  }

  async function runStream(): Promise<void> {
    if (!canSubmit.value)
      return

    const controller = resetOutput('stream')
    const startedAt = performance.now()

    function handleStreamEvent(event: LLMStreamEvent): void {
      if (controller.signal.aborted)
        return

      if (event.type === 'token') {
        content.value += event.delta
        chunks.value = [
          ...chunks.value,
          {
            index: chunks.value.length + 1,
            delta: event.delta,
            offsetMs: Math.round(performance.now() - startedAt),
            accumulatedChars: content.value.length,
          },
        ]
        return
      }

      if (event.type === 'final') {
        content.value = event.content
        metadata.value = {
          model: event.metadata.model,
          elapsedMs: event.metadata.elapsedMs,
        }
        return
      }

      status.value = 'error'
      error.value = event.message
    }

    try {
      await api.streamChat(toRequest(), {
        signal: controller.signal,
        onEvent: handleStreamEvent,
      })

      if (controller.signal.aborted)
        return

      if (status.value === 'running')
        status.value = error.value ? 'error' : 'done'
    }
    catch (requestError) {
      handleRequestError(controller, requestError)
    }
    finally {
      finishRequest(controller)
    }
  }

  function stop(): void {
    abortController.value?.abort()
    abortController.value = null
    if (status.value === 'running')
      status.value = 'aborted'
  }

  return {
    form,
    mode,
    status,
    content,
    error,
    metadata,
    chunks,
    health,
    isRunning,
    canSubmit,
    updateField,
    loadHealth,
    runChat,
    runStream,
    stop,
  }
}
