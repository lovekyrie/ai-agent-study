export interface LLMConfig {
  apiKey: string
  baseURL: string
  model: string
  temperature?: number
  topP?: number
  maxTokens?: number
  timeout?: number
  maxRetries?: number
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  name?: string
  /** 工具结果消息（role: 'tool'）需要关联到对应的 tool_call */
  tool_call_id?: string
  /** assistant 消息发起工具调用时携带，回传时必须保留以维持协议契约 */
  tool_calls?: ToolCall[]
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ChatResponse {
  content: string
  toolCalls?: ToolCall[]
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter'
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface ChatOptions {
  temperature?: number
  topP?: number
  maxTokens?: number
  stream?: boolean
  jsonMode?: boolean
  tools?: ToolDefinition[]
  signal?: AbortSignal
}

export interface StreamChunk {
  delta: string
  done: boolean
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ToolResult {
  toolCallId: string
  content: string
  error?: string
}