import type {
  MCPTool,
  MCPResource,
  MCPResourceContent,
  MCPPrompt,
  MCPToolCallRequest,
  MCPToolCallResult,
  MCPServerInfo,
} from './types.js'

export type TransportType = 'stdio' | 'http'

export interface TransportConfig {
  type: TransportType
  command?: string
  args?: string[]
  url?: string
  headers?: Record<string, string>
}

export class MCPClient {
  private config: TransportConfig
  private tools: MCPTool[] = []
  private resources: MCPResource[] = []
  private prompts: MCPPrompt[] = []
  private connected = false

  constructor(config: TransportConfig) {
    this.config = config
  }

  async connect(): Promise<MCPServerInfo> {
    this.connected = true
    if (this.config.type === 'http') {
      const url = this.config.url || 'http://localhost:3000'
      const headers = this.config.headers || {}
      try {
        const response = await fetch(`${url}/mcp/info`, { headers })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const info = (await response.json()) as MCPServerInfo

        // Fetch tools
        const toolsResp = await fetch(`${url}/mcp/tools`, { headers })
        if (toolsResp.ok) {
          this.tools = (await toolsResp.json()) as MCPTool[]
        }

        // Fetch resources
        const resourcesResp = await fetch(`${url}/mcp/resources`, { headers })
        if (resourcesResp.ok) {
          this.resources = (await resourcesResp.json()) as MCPResource[]
        }

        return info
      } catch (error) {
        throw new Error(
          `MCP connection failed: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    // stdio mode - placeholder
    return {
      name: this.config.command || 'mcp-server',
      version: '0.1.0',
      protocolVersion: '1.0',
    }
  }

  isConnected(): boolean {
    return this.connected
  }

  getTools(): MCPTool[] {
    return this.tools
  }

  getTool(name: string): MCPTool | undefined {
    return this.tools.find((t) => t.name === name)
  }

  getResources(): MCPResource[] {
    return this.resources
  }

  getResource(uri: string): MCPResource | undefined {
    return this.resources.find((r) => r.uri === uri)
  }

  getPrompts(): MCPPrompt[] {
    return this.prompts
  }

  async callTool(request: MCPToolCallRequest): Promise<MCPToolCallResult> {
    if (!this.connected) {
      throw new Error('MCP client not connected')
    }

    if (this.config.type === 'http') {
      const url = this.config.url || 'http://localhost:3000'
      const headers = this.config.headers || {}
      const response = await fetch(`${url}/mcp/tools/${request.name}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ arguments: request.arguments }),
      })

      if (!response.ok) {
        return {
          content: [{ type: 'text', text: `Error: HTTP ${response.status}` }],
          isError: true,
        }
      }

      return (await response.json()) as MCPToolCallResult
    }

    return {
      content: [{ type: 'text', text: 'stdio transport not implemented' }],
      isError: true,
    }
  }

  async readResource(uri: string): Promise<MCPResourceContent> {
    if (!this.connected) {
      throw new Error('MCP client not connected')
    }

    if (this.config.type === 'http') {
      const url = this.config.url || 'http://localhost:3000'
      const headers = this.config.headers || {}
      const response = await fetch(`${url}/mcp/resources/${encodeURIComponent(uri)}`, {
        headers,
      })

      if (!response.ok) {
        throw new Error(`Failed to read resource: HTTP ${response.status}`)
      }

      return (await response.json()) as MCPResourceContent
    }

    return { uri, text: 'Resource not available in stdio mode' }
  }

  toLLMFormat(): Array<{
    type: 'function'
    function: { name: string; description: string; parameters: MCPTool['inputSchema'] }
  }> {
    return this.tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }))
  }

  disconnect(): void {
    this.connected = false
    this.tools = []
    this.resources = []
    this.prompts = []
  }
}
