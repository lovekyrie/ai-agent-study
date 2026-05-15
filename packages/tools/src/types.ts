import type { z } from 'zod'

// 用 any 作为泛型默认值，避免函数参数逆变导致的"具体化工具无法装进通用 registry"。
// parameters 用 ZodType<Out, Def, In> 三参形式，允许 .default() 这种 input/output 不一致的 schema。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ToolDefinition<TParams = any> {
  name: string
  description: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parameters: z.ZodType<TParams, any, any>
  execute: (params: TParams, ctx?: ToolExecutionContext) => Promise<ToolResult> | ToolResult
  category?: string
  requiresApproval?: boolean
}

export interface ToolResult {
  content: string
  error?: string
  metadata?: Record<string, unknown>
}

export interface ToolCallRequest {
  name: string
  arguments: Record<string, unknown>
  /** OpenAI tool_call id，回传 role:'tool' 消息时需要 */
  id?: string
}

export interface ToolExecutionContext {
  userId?: string
  sessionId?: string
  permissions: string[]
  metadata: Record<string, unknown>
}

/** OpenAI function calling JSON Schema 格式 */
export interface LLMToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** 错误类型，便于上层区分处理 */
export type ToolErrorKind = 'not_found' | 'permission_denied' | 'validation' | 'execution'

export interface ToolError {
  kind: ToolErrorKind
  message: string
  details?: unknown
}
