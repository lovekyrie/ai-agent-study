# Stage 7: MCP (Model Context Protocol)

MCP (Model Context Protocol) 集成，支持 MCP Server 和 Client 开发。

## 核心功能

- **MCP Server**: 暴露 Tools、Resources、Prompts
- **MCP Client**: 连接 MCP Server 并调用其能力
- **Stdio Transport**: 通过标准输入输出通信
- **HTTP Transport**: 通过 HTTP API 通信

## 目录结构

```
src/
├── index.ts  # MCPServer, MCPClient, MCPHTTPClient
```

## 核心概念

### Tools
可执行的函数，Agent 可以调用：
```typescript
{
  name: 'file_read',
  description: 'Read file contents',
  inputSchema: { path: { type: 'string' } },
  handler: async ({ path }) => { ... }
}
```

### Resources
可读取的数据：
```typescript
{
  uri: 'file:///docs/README.md',
  name: 'README',
  mimeType: 'text/markdown',
  content: '...'
}
```

### Prompts
模板化的提示词：
```typescript
{
  name: 'summarize',
  template: 'Summarize: {{content}}',
  arguments: [{ name: 'content', required: true }]
}
```

## 使用示例

### 创建 MCP Server
```typescript
const server = new MCPServer({
  name: 'my-server',
  version: '1.0.0',
  tools: [...],
  resources: [...],
  prompts: [...]
})
```

### 连接 MCP Server
```typescript
const client = new MCPClient({
  serverName: 'my-server',
  transport: 'stdio',
  command: 'node',
  args: ['./mcp-server.js']
})
await client.connect()
const tools = await client.listTools()
const result = await client.callTool('tool_name', params)
```

### HTTP MCP Client
```typescript
const httpClient = new MCPHTTPClient('http://localhost:3001')
const tools = await httpClient.listTools()
const result = await httpClient.callTool('tool_name', params)
```

## 与 Agent 集成

MCP Server 可以作为 Agent 的工具来源：
```typescript
const agent = new Agent({ tools: [] })
for (const tool of await mcpClient.listTools()) {
  agent.registerTool(tool.name, (params) => mcpClient.callTool(tool.name, params))
}
```