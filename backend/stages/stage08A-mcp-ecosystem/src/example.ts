import { ToolRegistry } from '@ai-agent-study/tools'
import { mcpToolToDefinition } from './index.js'

const tool = mcpToolToDefinition(
  {
    name: 'filesystem_read',
    description: 'Read a file through MCP',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'File path' } },
      required: ['path'],
    },
  },
  {
    async callTool(_name, args) {
      return { content: [{ type: 'text', text: `read:${args.path}` }] }
    },
  },
  { requiresApproval: true },
)

const registry = new ToolRegistry({ permissions: ['approve'] }).register(tool)
console.log(await registry.execute({ name: 'filesystem_read', arguments: { path: 'README.md' } }))
