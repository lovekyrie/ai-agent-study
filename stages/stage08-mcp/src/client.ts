import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { MCPClientConfig } from './types.js'

/**
 * 业务面的 MCP Client。
 *
 * 包了 SDK `Client` 一层，提供：
 *   - 双 transport：stdio（子进程）和 streamable http（远程服务）
 *   - 连接生命周期管理 + `ensureConnected()` 防御
 *   - 缓存 tools/resources/prompts 列表（避免重复 RPC）
 *
 * 适用场景：在你的 Agent 里启动一个 MCPClient，把它当成"远程工具集合"挂上去。
 */
export class MCPClient {
  private readonly config: MCPClientConfig
  private readonly client = new Client({ name: 'stage08-mcp-client', version: '1.0.0' })
  private connected = false
  private transport?: Transport
  private tools: Array<{ name: string; description?: string; inputSchema?: unknown }> = []
  private resources: Array<{
    uri: string
    name: string
    description?: string
    mimeType?: string
  }> = []
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
    return result.tools.map((tool) => tool.name)
  }

  async listToolDefinitions(): Promise<
    Array<{ name: string; description?: string; inputSchema?: unknown }>
  > {
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
    return result.resources.map((resource) => resource.uri)
  }

  async readResource(uri: string): Promise<string> {
    this.ensureConnected()
    const result = await this.client.readResource({ uri })
    return result.contents
      .map((content) => {
        if ('text' in content) return content.text
        if ('blob' in content) return content.blob
        return ''
      })
      .join('\n')
  }

  async listPrompts(): Promise<string[]> {
    this.ensureConnected()
    const result = await this.client.listPrompts()
    this.prompts = result.prompts
    return result.prompts.map((prompt) => prompt.name)
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

/**
 * 简易 HTTP MCP 客户端：直接走 fetch。
 *
 * 与 `MCPClient` 的区别：
 *   - 不走 MCP protocol（不带能力协商、订阅等高级特性）
 *   - 只是把 server 暴露的 REST 风格 endpoint 包一层
 *   - 用于"我自己写一个简单 HTTP server，不想引入 SDK"的轻量场景
 */
export class MCPHTTPClient {
  private readonly baseUrl: string
  private readonly headers: Record<string, string>

  constructor(baseUrl: string, headers: Record<string, string> = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.headers = headers
  }

  async listTools(): Promise<{ name: string; description: string; inputSchema: unknown }[]> {
    const response = await fetch(`${this.baseUrl}/tools`, { headers: this.headers })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json() as Promise<
      { name: string; description: string; inputSchema: unknown }[]
    >
  }

  async callTool(name: string, params: Record<string, unknown>): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.headers },
      body: JSON.stringify({ name, params }),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  }

  async listResources(): Promise<{ uri: string; name: string; description: string }[]> {
    const response = await fetch(`${this.baseUrl}/resources`, { headers: this.headers })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json() as Promise<{ uri: string; name: string; description: string }[]>
  }

  async readResource(uri: string): Promise<{ content: string; mimeType: string }> {
    const response = await fetch(
      `${this.baseUrl}/resources/read?uri=${encodeURIComponent(uri)}`,
      { headers: this.headers }
    )
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json() as Promise<{ content: string; mimeType: string }>
  }

  async listPrompts(): Promise<{ name: string; description: string }[]> {
    const response = await fetch(`${this.baseUrl}/prompts`, { headers: this.headers })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json() as Promise<{ name: string; description: string }[]>
  }

  async getPrompt(
    name: string,
    args?: Record<string, string>
  ): Promise<{ messages: { role: string; content: string }[] }> {
    const response = await fetch(`${this.baseUrl}/prompts/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.headers },
      body: JSON.stringify({ name, args }),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json() as Promise<{ messages: { role: string; content: string }[] }>
  }
}
