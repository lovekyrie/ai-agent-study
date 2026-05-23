import type { LLMChatRequest, LLMChatResponse, LLMStreamEvent, TokenUsage } from '../../api/llmApi'

export type PlaygroundMode = 'none' | 'chat' | 'stream'
export type RequestStatus = 'idle' | 'running' | 'done' | 'error' | 'aborted'

export interface PromptFormState {
  systemPrompt: string
  prompt: string
  temperature: number
  maxTokens: number
}

export type PromptFormField = keyof PromptFormState

export interface ChunkLogItem {
  index: number
  delta: string
  offsetMs: number
  accumulatedChars: number
}

export interface ResponseMetadata {
  model: string
  elapsedMs: number
  usage?: TokenUsage
}

export interface LlmPlaygroundApi {
  chat: (request: LLMChatRequest, signal?: AbortSignal) => Promise<LLMChatResponse>
  streamChat: (
    request: LLMChatRequest,
    options: { signal?: AbortSignal, onEvent: (event: LLMStreamEvent) => void },
  ) => Promise<void>
  getHealth: (signal?: AbortSignal) => Promise<{ model: string, hasApiKey: boolean }>
}
