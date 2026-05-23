import { describe, expect, it } from 'vitest'
import {
  createMCPPrompt,
  createMCPResource,
  createMCPTool,
  MCPServer,
} from '../src/index.js'

function makeServer() {
  return new MCPServer({
    name: 'test-server',
    version: '0.1.0',
    tools: [
      createMCPTool('echo', 'Echo input', { text: {} }, async ({ text }) => text),
      createMCPTool('add', 'Add numbers', { a: {}, b: {} }, async ({ a, b }) => {
        return (a as unknown as number) + (b as unknown as number)
      }),
    ],
    resources: [
      createMCPResource('file:///readme', 'README', 'Project readme', 'text/markdown', '# Hi'),
    ],
    prompts: [
      createMCPPrompt('greet', 'Greet user', 'Hello {{name}}!', [
        { name: 'name', description: 'User name', required: true },
      ]),
    ],
  })
}

describe('mCPServer', () => {
  it('returns manifest with all registered capabilities', () => {
    const server = makeServer()
    const manifest = server.getManifest()

    expect(manifest.name).toBe('test-server')
    expect(manifest.tools).toHaveLength(2)
    expect(manifest.resources).toHaveLength(1)
    expect(manifest.prompts).toHaveLength(1)
    expect(manifest.tools[0].name).toBe('echo')
  })

  it('handleToolCall invokes the correct handler', async () => {
    const server = makeServer()
    const result = await server.handleToolCall('add', { a: 3, b: 5 })

    expect(result).toBe(8)
  })

  it('handleToolCall throws for unknown tool', async () => {
    const server = makeServer()

    await expect(server.handleToolCall('nope', {})).rejects.toThrow('Tool not found: nope')
  })

  it('getResource returns resource by URI', () => {
    const server = makeServer()
    const r = server.getResource('file:///readme')

    expect(r).toBeDefined()
    expect(r!.content).toBe('# Hi')
    expect(r!.mimeType).toBe('text/markdown')
  })

  it('getResource returns undefined for unknown URI', () => {
    const server = makeServer()
    expect(server.getResource('file:///unknown')).toBeUndefined()
  })

  it('getPrompt returns prompt by name', () => {
    const server = makeServer()
    const p = server.getPrompt('greet')

    expect(p).toBeDefined()
    expect(p!.template).toBe('Hello {{name}}!')
  })

  it('list methods return correct keys', () => {
    const server = makeServer()

    expect(server.listTools()).toEqual(['echo', 'add'])
    expect(server.listResources()).toEqual(['file:///readme'])
    expect(server.listPrompts()).toEqual(['greet'])
  })

  it('toSDKServer returns a connected McpServer instance', () => {
    const server = makeServer()
    const sdk = server.toSDKServer()

    // McpServer from SDK has a connect method
    expect(typeof sdk.connect).toBe('function')
  })
})

describe('createMCPPrompt template rendering (via getPrompt)', () => {
  it('stores template with arguments correctly', () => {
    const p = createMCPPrompt('test', 'Test prompt', 'Say {{greeting}} to {{name}}', [
      { name: 'greeting', description: 'Greeting word', required: true },
      { name: 'name', description: 'Person', required: true },
    ])

    expect(p.name).toBe('test')
    expect(p.template).toContain('{{greeting}}')
    expect(p.arguments).toHaveLength(2)
  })
})
