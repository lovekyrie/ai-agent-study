# Stage 08A: MCP Ecosystem

把第三方 MCP Server 暴露的 tools 桥接进当前项目的 `ToolRegistry`，统一权限、审批、超时和错误返回。

## 核心能力

- MCP tool manifest → 本地 `ToolDefinition`
- JSON schema 子集 → Zod 参数校验
- MCP call result → `ToolResult`
- 支持 `requiresApproval`

## 运行

```bash
pnpm --filter stage08a-mcp-ecosystem test
pnpm --filter stage08a-mcp-ecosystem dev
```

## 验收

- 能把 MCP tools 动态注册给 Agent
- 未授权 tool 不能绕过本地审批
- MCP server 错误会被归一化为 tool error
