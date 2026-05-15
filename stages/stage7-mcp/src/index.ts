import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

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
  arguments?: { name: string; description: string; required: boolean }[]
  template: string
}

export interface MCPServerConfig {
  name: string
  version: string
  tools: MCPTool[]
  resources: MCPResource[]
  prompts: MCPPrompt[]
}

export class MCPServer {
  private config: MCPServerConfig
  private tools: Map<string, MCPTool> = new Map()
  private resources: Map<string, MCPResource> = new Map()
  private prompts: Map<string, MCPPrompt> = new Map()

  constructor(config: MCPServerConfig) {
    this.config = config
    for (const tool of config.tools) {
      this.tools.set(tool.name, tool)
    }
    for (const resource of config.resources) {
      this.resources.set(resource.uri, resource)
    }
    for (const prompt of config.prompts) {
      this.prompts.set(prompt.name, prompt)
    }
  }

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
    if (!tool) {
      throw new Error(`Tool not found: ${name}`)
    }
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
              structuredContent: typeof result === 'object' && result !== null
                ? result as Record<string, unknown>
                : { value: result },
            }
          } catch (error) {
            return {
              isError: true,
              content: [{
                type: 'text' as const,
                text: error instanceof Error ? error.message : String(error),
              }],
            }
          }
        }
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
          contents: [{
            uri: resource.uri,
            mimeType: resource.mimeType,
            text: resource.content,
          }],
        })
      )
    }

    for (const prompt of this.prompts.values()) {
      const argsSchema: Record<string, z.ZodString> = {}
      for (const arg of prompt.arguments || []) {
        argsSchema[arg.name] = z.string().describe(arg.description)
      }

      server.registerPrompt(
        prompt.name,
        {
          description: prompt.description,
          argsSchema,
        },
        async (args) => ({
          messages: [{
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: renderTemplate(prompt.template, args as Record<string, string>),
            },
          }],
        })
      )
    }

    return server
  }

  async connectStdio(): Promise<void> {
    await this.toSDKServer().connect(new StdioServerTransport())
  }
}

export interface MCPClientConfig {
  serverName: string
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  url?: string
  headers?: Record<string, string>
}

export class MCPClient {
  private config: MCPClientConfig
  private connected: boolean = false
  private client = new Client({ name: 'stage7-mcp-client', version: '1.0.0' })
  private transport?: Transport
  private tools: Array<{ name: string; description?: string; inputSchema?: unknown }> = []
  private resources: Array<{ uri: string; name: string; description?: string; mimeType?: string }> = []
  private prompts: Array<{ name: string; description?: string; arguments?: unknown[] }> = []

  constructor(config: MCPClientConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    if (this.config.transport === 'stdio' && this.config.command) {
      this.transport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args,
        stderr: 'pipe',
      })
    } else if (this.config.transport === 'http' && this.config.url) {
      this.transport = new StreamableHTTPClientTransport(new URL(this.config.url), {
        requestInit: { headers: this.config.headers },
      })
    } else {
      throw new Error(`Invalid MCP ${this.config.transport} transport configuration`)
    }
    await this.client.connect(this.transport)
    await this.refreshCapabilities()
    this.connected = true
  }

  async disconnect(): Promise<void> {
    await this.client.close()
    this.connected = false
    this.transport = undefined
    this.tools = []
    this.resources = []
    this.prompts = []
  }

  isConnected(): boolean {
    return this.connected
  }

  async listTools(): Promise<string[]> {
    this.ensureConnected()
    const result = await this.client.listTools()
    this.tools = result.tools
    return result.tools.map(tool => tool.name)
  }

  async listToolDefinitions(): Promise<Array<{ name: string; description?: string; inputSchema?: unknown }>> {
    this.ensureConnected()
    const result = await this.client.listTools()
    this.tools = result.tools
    return this.tools
  }

  async callTool(name: string, params: Record<string, unknown>): Promise<unknown> {
    this.ensureConnected()
    return this.client.callTool({ name, arguments: params })
  }

  async listResources(): Promise<string[]> {
    this.ensureConnected()
    const result = await this.client.listResources()
    this.resources = result.resources
    return result.resources.map(resource => resource.uri)
  }

  async readResource(uri: string): Promise<string> {
    this.ensureConnected()
    const result = await this.client.readResource({ uri })
    return result.contents.map(content => {
      if ('text' in content) return content.text
      if ('blob' in content) return content.blob
      return ''
    }).join('\n')
  }

  async listPrompts(): Promise<string[]> {
    this.ensureConnected()
    const result = await this.client.listPrompts()
    this.prompts = result.prompts
    return result.prompts.map(prompt => prompt.name)
  }

  async getPrompt(name: string, args?: Record<string, string>): Promise<unknown> {
    this.ensureConnected()
    return this.client.getPrompt({ name, arguments: args })
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Not connected to MCP server. Call connect() first.')
    }
  }

  private async refreshCapabilities(): Promise<void> {
    const [tools, resources, prompts] = await Promise.allSettled([
      this.client.listTools(),
      this.client.listResources(),
      this.client.listPrompts(),
    ])
    if (tools.status === 'fulfilled') this.tools = tools.value.tools
    if (resources.status === 'fulfilled') this.resources = resources.value.resources
    if (prompts.status === 'fulfilled') this.prompts = prompts.value.prompts
  }
}

// MCP Client for connecting to external MCP servers via HTTP
export class MCPHTTPClient {
  private baseUrl: string
  private headers: Record<string, string>

  constructor(baseUrl: string, headers: Record<string, string> = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.headers = headers
  }

  async listTools(): Promise<{ name: string; description: string; inputSchema: unknown }[]> {
    const response = await fetch(`${this.baseUrl}/tools`, {
      headers: this.headers,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json() as Promise<{ name: string; description: string; inputSchema: unknown }[]>
  }

  async callTool(name: string, params: Record<string, unknown>): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/tools/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify({ name, params }),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  }

  async listResources(): Promise<{ uri: string; name: string; description: string }[]> {
    const response = await fetch(`${this.baseUrl}/resources`, {
      headers: this.headers,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json() as Promise<{ uri: string; name: string; description: string }[]>
  }

  async readResource(uri: string): Promise<{ content: string; mimeType: string }> {
    const response = await fetch(`${this.baseUrl}/resources/read?uri=${encodeURIComponent(uri)}`, {
      headers: this.headers,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json() as Promise<{ content: string; mimeType: string }>
  }

  async listPrompts(): Promise<{ name: string; description: string }[]> {
    const response = await fetch(`${this.baseUrl}/prompts`, {
      headers: this.headers,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json() as Promise<{ name: string; description: string }[]>
  }

  async getPrompt(name: string, args?: Record<string, string>): Promise<{ messages: { role: string; content: string }[] }> {
    const response = await fetch(`${this.baseUrl}/prompts/get`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify({ name, args }),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json() as Promise<{ messages: { role: string; content: string }[] }>
  }
}

// Helper to create tools compatible with MCP protocol
export function createMCPTool<T extends Record<string, unknown>>(
  name: string,
  description: string,
  inputSchema: T,
  handler: (params: T) => Promise<unknown>
): MCPTool {
  return {
    name,
    description,
    inputSchema: inputSchema as Record<string, unknown>,
    handler: handler as (params: Record<string, unknown>) => Promise<unknown>,
  }
}

// Helper to create resources
export function createMCPResource(
  uri: string,
  name: string,
  description: string,
  mimeType: string,
  content: string
): MCPResource {
  return { uri, name, description, mimeType, content }
}

// Helper to create prompts
export function createMCPPrompt(
  name: string,
  description: string,
  template: string,
  arguments_?: MCPPrompt['arguments']
): MCPPrompt {
  return { name, description, arguments: arguments_, template }
}

function stringifyResult(result: unknown): string {
  return typeof result === 'string' ? result : JSON.stringify(result, null, 2)
}

function renderTemplate(template: string, args: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => args[key] ?? '')
}
