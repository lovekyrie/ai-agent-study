// Stage 08: MCP（Model Context Protocol）
//
// 把 LLM Agent 的"工具/资源/提示词"标准化为协议，避免每家系统各造轮子。
//
// 文件分工：
//   - types.ts: 业务面类型（MCPTool / MCPResource / MCPPrompt / 配置）
//   - server.ts: MCPServer + 工厂函数（声明 → 业务测试 → 转 SDK 实例 → stdio）
//   - client.ts: MCPClient（SDK 包装，stdio + http transport）+ MCPHTTPClient（轻量 fetch 版）

export { MCPClient, MCPHTTPClient } from './client.js'

export {
  createMCPPrompt,
  createMCPResource,
  createMCPTool,
  MCPServer,
} from './server.js'

export type {
  MCPClientConfig,
  MCPPrompt,
  MCPResource,
  MCPServerConfig,
  MCPTool,
} from './types.js'
