/**
 * Stage 08 内部使用的 MCP 类型。
 *
 * 与 `@modelcontextprotocol/sdk` 自身的类型相比，这里的形状更简单：
 *   - 我们关心 tool/resource/prompt 三类资源
 *   - `inputSchema` 用宽松的 `Record<string, unknown>` 而非 zod schema
 *     （转 SDK server 时再用 `z.object({}).passthrough()` 兜底）
 *
 * 真正的 MCP 协议交互（消息封装、能力协商）由 SDK 处理，这里只负责"业务面"。
 */

export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (params: Record<string, unknown>) => Promise<unknown>
}

export interface MCPResource {
  uri: string
  name: string
  description: string
  mimeType: string
  content: string
}

export interface MCPPrompt {
  name: string
  description: string
  arguments?: { name: string, description: string, required: boolean }[]
  template: string
}

export interface MCPServerConfig {
  name: string
  version: string
  tools: MCPTool[]
  resources: MCPResource[]
  prompts: MCPPrompt[]
}

export interface MCPClientConfig {
  serverName: string
  transport: 'stdio' | 'http'
  /** stdio only */
  command?: string
  /** stdio only */
  args?: string[]
  /** http only */
  url?: string
  /** http only */
  headers?: Record<string, string>
}
