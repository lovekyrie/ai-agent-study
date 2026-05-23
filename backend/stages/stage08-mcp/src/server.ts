import type { MCPPrompt, MCPResource, MCPServerConfig, MCPTool } from './types.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

/**
 * 业务面的 MCP Server。
 *
 * 设计取舍：把"声明 tool/resource/prompt"和"接 SDK / 走 stdio"分开。
 *   - 用 `getManifest()` / `handleToolCall()` 直接做单元测试，**不用启动进程**
 *   - 用 `toSDKServer()` 把声明转成 SDK 的 `McpServer` 实例，然后 `.connect(transport)` 暴露给外部 host
 *
 * 这样写的好处：tool 业务逻辑可以在普通测试里跑，stdio/http 集成是另一层独立关注。
 */
export class MCPServer {
  private readonly config: MCPServerConfig
  private readonly tools = new Map<string, MCPTool>()
  private readonly resources = new Map<string, MCPResource>()
  private readonly prompts = new Map<string, MCPPrompt>()

  constructor(config: MCPServerConfig) {
    this.config = config
    for (const tool of config.tools) this.tools.set(tool.name, tool)
    for (const resource of config.resources) this.resources.set(resource.uri, resource)
    for (const prompt of config.prompts) this.prompts.set(prompt.name, prompt)
  }

  /** 元信息：客户端常拿来缓存或做能力协商。 */
  getManifest() {
    return {
      name: this.config.name,
      version: this.config.version,
      tools: this.config.tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
      resources: this.config.resources.map(r => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      })),
      prompts: this.config.prompts.map(p => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments,
      })),
    }
  }

  async handleToolCall(name: string, params: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(name)
    if (!tool)
      throw new Error(`Tool not found: ${name}`)
    return tool.handler(params)
  }

  getResource(uri: string): MCPResource | undefined {
    return this.resources.get(uri)
  }

  getPrompt(name: string): MCPPrompt | undefined {
    return this.prompts.get(name)
  }

  listTools(): string[] {
    return Array.from(this.tools.keys())
  }

  listResources(): string[] {
    return Array.from(this.resources.keys())
  }

  listPrompts(): string[] {
    return Array.from(this.prompts.keys())
  }

  /**
   * 把业务声明转换成 SDK 的 `McpServer`。
   *
   * - tool: 用 `passthrough()` 接受任意参数（业务校验在 handler 内做）
   * - resource: 静态 content + mimeType
   * - prompt: 把 `{{var}}` 模板渲染成 user message
   */
  toSDKServer(): McpServer {
    const server = new McpServer({
      name: this.config.name,
      version: this.config.version,
    })

    for (const tool of this.tools.values()) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: z.object({}).passthrough(),
        },
        async (args: Record<string, unknown>) => {
          try {
            const result = await tool.handler(args)
            return {
              content: [{ type: 'text' as const, text: stringifyResult(result) }],
              structuredContent:
                typeof result === 'object' && result !== null
                  ? (result as Record<string, unknown>)
                  : { value: result },
            }
          }
          catch (error) {
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: error instanceof Error ? error.message : String(error),
                },
              ],
            }
          }
        },
      )
    }

    for (const resource of this.resources.values()) {
      server.registerResource(
        resource.name,
        resource.uri,
        {
          description: resource.description,
          mimeType: resource.mimeType,
        },
        async () => ({
          contents: [
            {
              uri: resource.uri,
              mimeType: resource.mimeType,
              text: resource.content,
            },
          ],
        }),
      )
    }

    for (const prompt of this.prompts.values()) {
      const argsSchema: Record<string, z.ZodString> = {}
      for (const arg of prompt.arguments ?? []) {
        argsSchema[arg.name] = z.string().describe(arg.description)
      }

      server.registerPrompt(
        prompt.name,
        {
          description: prompt.description,
          argsSchema,
        },
        async args => ({
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: renderTemplate(prompt.template, args as Record<string, string>),
              },
            },
          ],
        }),
      )
    }

    return server
  }

  /** 启动 stdio 监听（适合作为子进程被 MCP host 启动）。 */
  async connectStdio(): Promise<void> {
    await this.toSDKServer().connect(new StdioServerTransport())
  }
}

/** 工厂：声明式创建 tool。 */
export function createMCPTool<T extends Record<string, unknown>>(
  name: string,
  description: string,
  inputSchema: T,
  handler: (params: T) => Promise<unknown>,
): MCPTool {
  return {
    name,
    description,
    inputSchema: inputSchema as Record<string, unknown>,
    handler: handler as (params: Record<string, unknown>) => Promise<unknown>,
  }
}

export function createMCPResource(
  uri: string,
  name: string,
  description: string,
  mimeType: string,
  content: string,
): MCPResource {
  return { uri, name, description, mimeType, content }
}

export function createMCPPrompt(
  name: string,
  description: string,
  template: string,
  arguments_?: MCPPrompt['arguments'],
): MCPPrompt {
  return { name, description, arguments: arguments_, template }
}

function stringifyResult(result: unknown): string {
  return typeof result === 'string' ? result : JSON.stringify(result, null, 2)
}

function renderTemplate(template: string, args: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => args[key] ?? '')
}
