import { ToolRegistry } from '@ai-agent-study/tools'
import { describe, expect, it } from 'vitest'
import { mcpToolToDefinition } from '../src/index.js'

describe('stage08A MCP bridge', () => {
  it('bridges MCP tools into ToolRegistry with local approval', async () => {
    const tool = mcpToolToDefinition(
      {
        name: 'github_search',
        description: 'Search GitHub',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
      {
        async callTool(_name, args) {
          return { content: [{ type: 'text', text: `result:${args.query}` }] }
        },
      },
      { requiresApproval: true },
    )

    const denied = await new ToolRegistry().register(tool).execute({ name: 'github_search', arguments: { query: 'agent' } })
    expect(denied.error).toContain('requires approval')

    const allowed = await new ToolRegistry({ permissions: ['approve'] })
      .register(tool)
      .execute({ name: 'github_search', arguments: { query: 'agent' } })
    expect(allowed.content).toBe('result:agent')
  })
})
