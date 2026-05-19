# Stage 08 — MCP (Model Context Protocol)

> **目标**：理解并实现 MCP 的三大资源类型（Tools / Resources / Prompts），掌握 Server 端声明与 Client 端消费的完整闭环。

---

## 核心概念

| 资源 | 作用 | 示例 |
|------|------|------|
| **Tool** | 可执行动作，Agent 通过 `callTool` 触发 | `file_read`、`web_search` |
| **Resource** | 只读数据，提供给 Agent 作为上下文 | `file:///docs/README.md` |
| **Prompt** | 模板化提示词，可携带参数 | `summarize(content)` |

MCP 的核心价值：**让工具/资源/提示词的定义标准化**，使任何兼容 MCP 的 Agent 可以无缝接入。

---

## 目录结构

```
src/
├── types.ts       # MCPTool / MCPResource / MCPPrompt / Config 接口
├── server.ts      # MCPServer + createMCPTool / createMCPResource / createMCPPrompt
├── client.ts      # MCPClient (SDK, stdio/http) + MCPHTTPClient (fetch)
├── index.ts       # barrel re-export
└── example.ts     # 完整示例（创建 server → 调用 tool → 读取 resource）
test/
├── server.test.ts # 9 tests — manifest / tool / resource / prompt / toSDK
└── client.test.ts # 12 tests — connection guard / HTTP client / fetch mock
```

---

## 快速上手

### 1. 创建 MCP Server

```typescript
import { MCPServer, createMCPTool, createMCPResource, createMCPPrompt } from './server.js'

const server = new MCPServer({
  name: 'fs-server',
  version: '1.0.0',
  tools: [
    createMCPTool({
      name: 'file_read',
      description: '读取文件内容',
      inputSchema: { path: { type: 'string', description: '文件路径' } },
      handler: async ({ path }) => readFileSync(path as string, 'utf-8'),
    }),
  ],
  resources: [
    createMCPResource({
      uri: 'file:///docs/README.md',
      name: 'README',
      mimeType: 'text/markdown',
      content: '# Hello',
    }),
  ],
  prompts: [
    createMCPPrompt({
      name: 'summarize',
      description: '摘要模板',
      arguments: [{ name: 'content', description: '待摘要文本', required: true }],
      template: '请用三句话摘要以下内容：\n\n{{content}}',
    }),
  ],
})
```

### 2. 直接调用（Server 内）

```typescript
const result = await server.callTool('file_read', { path: '/tmp/a.txt' })
const manifest = server.getManifest()   // { tools, resources, prompts }
const rendered = server.renderPrompt('summarize', { content: 'long text…' })
```

### 3. SDK Client（stdio / http 传输）

```typescript
import { MCPClient } from './client.js'

const client = new MCPClient({
  serverName: 'fs-server',
  transport: 'stdio',
  command: 'node',
  args: ['./server.js'],
})
await client.connect()
const tools = await client.listTools()
const res = await client.callTool('file_read', { path: '/tmp/a.txt' })
await client.disconnect()
```

### 4. HTTP Client（轻量 fetch）

```typescript
import { MCPHTTPClient } from './client.js'

const http = new MCPHTTPClient('http://localhost:3001', { Authorization: 'Bearer xxx' })
const tools = await http.listTools()
const res = await http.callTool('file_read', { path: '/tmp/a.txt' })
```

---

## 与 Agent 集成模式

```typescript
// 将 MCP tools 动态注册为 Agent 可用工具
for (const name of await mcpClient.listTools()) {
  agent.registerTool(name, (params) => mcpClient.callTool(name, params))
}
```

---

## 运行

```bash
pnpm --filter stage08-mcp dev      # 运行 example
pnpm --filter stage08-mcp test     # 21 tests
```

## 验收标准

- [ ] `MCPServer` 可注册 tool/resource/prompt 并暴露统一 manifest
- [ ] `createMCPTool` / `createMCPResource` / `createMCPPrompt` 工厂方法覆盖三类资源
- [ ] `MCPClient` 连接前调用任何方法 → 抛出 `Not connected` 错误
- [ ] `MCPHTTPClient` 正确拼接 URL、传递 headers、处理 HTTP 错误码
- [ ] 所有 21 个测试通过