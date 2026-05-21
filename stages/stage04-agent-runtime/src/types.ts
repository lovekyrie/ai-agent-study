import type { LLMClient } from '@ai-agent-study/llm-client'
import type { ToolCallRequest, ToolDefinition, ToolResult } from '@ai-agent-study/tools'

export type AgentStatus
  = | 'idle'
    | 'thinking'
    | 'executing'
    | 'done'
    | 'error'
    | 'max_iterations'

/** 单次 LLM 调用 + 该轮触发的工具执行结果（多个工具并行） */
export interface AgentStep {
  stepNumber: number
  /** LLM 的 reasoning/输出文本（OpenAI 的 assistant.content） */
  thought: string
  /** 该轮 LLM 请求的工具调用（可能多个） */
  toolCalls: ToolCallRequest[]
  /** 与 toolCalls 一一对应的执行结果 */
  toolResults: ToolResult[]
  /** 本轮的 finish reason，便于上层观测 */
  finishReason?: string
  /** 本轮异常 */
  error?: string
}

export interface AgentConfig {
  /** 最大循环轮数（含 LLM 调用 + 工具执行） */
  maxIterations?: number
  /** 每次 LLM 调用的 maxTokens */
  maxTokensPerIteration?: number
  /** LLM 温度 */
  temperature?: number
  /** 自定义 system prompt */
  systemPrompt?: string
  /** 注入的 LLM 客户端（默认走 createLLMClient） */
  llmClient?: LLMClient
  /** 注入工具集；默认空。常用：传 builtinTools */
  tools?: ToolDefinition[]
  /** 工具权限（如 ['approve']）；不传则 requiresApproval 工具会被拒 */
  permissions?: string[]
  /** 取消信号 */
  signal?: AbortSignal
  /** 每步回调，便于外部观测/打印/UI 集成 */
  onStep?: (step: AgentStep) => void
}

export interface AgentResponse {
  status: AgentStatus
  /** 最终 assistant 回答（最后一次 LLM 调用且无 tool_calls 时的 content） */
  message: string
  /** 完整执行轨迹（每轮一个 step） */
  trace: ExecutionTrace
}

export interface ExecutionTrace {
  task: string
  steps: AgentStep[]
  iterations: number
  status: AgentStatus
  finalMessage: string
}
