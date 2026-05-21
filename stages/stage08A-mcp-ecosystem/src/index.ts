import type { MCPTool, MCPToolCallResult } from '@ai-agent-study/mcp'
import type { ToolDefinition, ToolResult } from '@ai-agent-study/tools'
import { z } from 'zod'

export interface MCPToolCaller {
  callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult>
}

export function mcpToolToDefinition(
  tool: MCPTool,
  caller: MCPToolCaller,
  options?: { requiresApproval?: boolean; category?: string }
): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    parameters: schemaToZod(tool.inputSchema),
    category: options?.category ?? 'mcp',
    requiresApproval: options?.requiresApproval ?? false,
    execute: async (params) => mcpResultToToolResult(await caller.callTool(tool.name, params as Record<string, unknown>)),
  }
}

export function mcpResultToToolResult(result: MCPToolCallResult): ToolResult {
  const content = result.content
    .map((item) => item.text ?? item.data ?? '')
    .filter(Boolean)
    .join('\n')
  return result.isError ? { content: '', error: content || 'MCP tool failed' } : { content }
}

function schemaToZod(schema: MCPTool['inputSchema']) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [key, property] of Object.entries(schema.properties)) {
    let value: z.ZodTypeAny
    if (property.enum) value = z.enum(property.enum as [string, ...string[]])
    else if (property.type === 'number') value = z.number()
    else if (property.type === 'boolean') value = z.boolean()
    else value = z.string()
    if (!schema.required?.includes(key)) value = value.optional()
    shape[key] = value
  }
  return z.object(shape)
}
