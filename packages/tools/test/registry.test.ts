import { describe, it, expect, beforeEach } from 'vitest'
import { z } from 'zod'
import { ToolRegistry } from '../src/registry.js'
import {
  builtinTools,
  readFileTool,
  httpRequestTool,
  calculatorTool,
  getCurrentTimeTool,
} from '../src/builtin.js'
import type { ToolDefinition } from '../src/types.js'

function createTestTool(name = 'test_tool'): ToolDefinition {
  return {
    name,
    description: 'A test tool',
    parameters: z.object({ input: z.string() }),
    execute: async (params) => {
      const p = params as { input: string }
      return { content: `Processed: ${p.input}` }
    },
  }
}

describe('ToolRegistry: basic', () => {
  let registry: ToolRegistry
  beforeEach(() => {
    registry = new ToolRegistry()
  })

  it('registers a tool', () => {
    const tool = createTestTool()
    registry.register(tool)
    expect(registry.get('test_tool')).toBe(tool)
  })

  it('throws on duplicate registration', () => {
    registry.register(createTestTool())
    expect(() => registry.register(createTestTool())).toThrow(/already registered/)
  })

  it('registers multiple tools', () => {
    registry.registerAll([createTestTool('a'), createTestTool('b')])
    expect(registry.list()).toHaveLength(2)
  })

  it('unregisters a tool', () => {
    registry.register(createTestTool())
    expect(registry.unregister('test_tool')).toBe(true)
    expect(registry.get('test_tool')).toBeUndefined()
  })

  it('lists by category', () => {
    const a = createTestTool('a'); a.category = 'c1'
    const b = createTestTool('b'); b.category = 'c2'
    registry.registerAll([a, b])
    expect(registry.listByCategory('c1')).toHaveLength(1)
    expect(registry.listCategories().sort()).toEqual(['c1', 'c2'])
  })
})

describe('ToolRegistry: execute', () => {
  let registry: ToolRegistry
  beforeEach(() => {
    registry = new ToolRegistry()
  })

  it('executes a registered tool', async () => {
    registry.register(createTestTool())
    const result = await registry.execute({ name: 'test_tool', arguments: { input: 'hello' } })
    expect(result).toEqual({ content: 'Processed: hello' })
  })

  it('returns error for unknown tool', async () => {
    const result = await registry.execute({ name: 'unknown', arguments: {} })
    expect(result.error).toMatch(/not found/)
  })

  it('formats Zod errors friendly (path: message; ...)', async () => {
    registry.register(createTestTool())
    const result = await registry.execute({ name: 'test_tool', arguments: { input: 123 } })
    expect(result.error).toMatch(/parameter validation failed/)
    expect(result.error).toMatch(/input:/)
  })

  it('distinguishes execution error from validation error', async () => {
    registry.register({
      name: 'boom',
      description: 'throws',
      parameters: z.object({}),
      execute: async () => {
        throw new Error('inner failure')
      },
    })
    const result = await registry.execute({ name: 'boom', arguments: {} })
    expect(result.error).toMatch(/execution failed/)
    expect(result.error).toMatch(/inner failure/)
  })

  it('runs batch and isolates per-tool failures', async () => {
    registry.register(createTestTool('a'))
    registry.register({
      name: 'b',
      description: 'fails',
      parameters: z.object({}),
      execute: async () => {
        throw new Error('b broken')
      },
    })
    const results = await registry.executeBatch([
      { name: 'a', arguments: { input: 'ok' } },
      { name: 'b', arguments: {} },
    ])
    expect(results[0].content).toBe('Processed: ok')
    expect(results[1].error).toMatch(/b broken/)
  })

  it('blocks tool requiring approval without permission', async () => {
    const t = createTestTool('danger')
    t.requiresApproval = true
    registry.register(t)
    const result = await registry.execute({ name: 'danger', arguments: { input: 'x' } })
    expect(result.error).toMatch(/approval/)
  })

  it('allows approved tool with permission', async () => {
    const t = createTestTool('danger')
    t.requiresApproval = true
    registry.register(t)
    registry.setContext({ permissions: ['approve'] })
    const result = await registry.execute({ name: 'danger', arguments: { input: 'x' } })
    expect(result.content).toBe('Processed: x')
  })

  it('getContext returns deep copy (mutation does not leak)', () => {
    registry.setContext({ permissions: ['p1'], metadata: { k: 'v' } })
    const ctx = registry.getContext()
    ctx.permissions.push('hacked')
    ;(ctx.metadata as Record<string, string>).k = 'hacked'
    const fresh = registry.getContext()
    expect(fresh.permissions).toEqual(['p1'])
    expect(fresh.metadata).toEqual({ k: 'v' })
  })
})

describe('ToolRegistry: toLLMFormat', () => {
  let registry: ToolRegistry
  beforeEach(() => {
    registry = new ToolRegistry()
  })

  it('converts Zod schema to JSON Schema (object with properties)', () => {
    registry.register(createTestTool())
    const [llmTool] = registry.toLLMFormat()
    expect(llmTool.type).toBe('function')
    expect(llmTool.function.name).toBe('test_tool')

    const params = llmTool.function.parameters as Record<string, unknown>
    expect(params.type).toBe('object')
    expect(params.properties).toBeDefined()
    expect((params.properties as Record<string, unknown>).input).toBeDefined()
    expect(params.required).toContain('input')
  })

  it('annotates requiresApproval in description', () => {
    const t = createTestTool('danger')
    t.requiresApproval = true
    registry.register(t)
    const [llmTool] = registry.toLLMFormat()
    expect(llmTool.function.description).toMatch(/requires approval/)
  })

  it('serializable to JSON without circular references', () => {
    registry.registerAll(builtinTools)
    expect(() => JSON.stringify(registry.toLLMFormat())).not.toThrow()
  })
})

// ============================================================================
// 内置工具的安全边界测试
// ============================================================================

describe('builtin: read_file sandbox', () => {
  let registry: ToolRegistry
  beforeEach(() => {
    registry = new ToolRegistry({ permissions: ['approve'] })
    registry.register(readFileTool)
  })

  it('rejects path traversal outside baseDir', async () => {
    registry.setContext({ permissions: ['approve'], metadata: { readFileBaseDir: '/tmp' } })
    const result = await registry.execute({
      name: 'read_file',
      arguments: { path: '../../../etc/passwd' },
    })
    expect(result.error).toMatch(/outside the allowed base dir/)
  })

  it('rejects non-existent file', async () => {
    const result = await registry.execute({
      name: 'read_file',
      arguments: { path: '__definitely_not_existing_file__' },
    })
    expect(result.error).toMatch(/File not found/)
  })
})

describe('builtin: http_request guards', () => {
  let registry: ToolRegistry
  beforeEach(() => {
    registry = new ToolRegistry({ permissions: ['approve'] })
    registry.register(httpRequestTool)
  })

  it('rejects localhost', async () => {
    const result = await registry.execute({
      name: 'http_request',
      arguments: { url: 'http://localhost:8080/' },
    })
    expect(result.error).toMatch(/private\/loopback/)
  })

  it('rejects 127.0.0.1', async () => {
    const result = await registry.execute({
      name: 'http_request',
      arguments: { url: 'http://127.0.0.1/' },
    })
    expect(result.error).toMatch(/private\/loopback/)
  })

  it('rejects cloud metadata IP', async () => {
    const result = await registry.execute({
      name: 'http_request',
      arguments: { url: 'http://169.254.169.254/latest/meta-data/' },
    })
    expect(result.error).toMatch(/private\/loopback/)
  })

  it('rejects file:// protocol', async () => {
    const result = await registry.execute({
      name: 'http_request',
      arguments: { url: 'file:///etc/passwd' },
    })
    expect(result.error).toMatch(/Invalid URL|Unsupported protocol/)
  })

  it('rejects 10.0.0.x private range', async () => {
    const result = await registry.execute({
      name: 'http_request',
      arguments: { url: 'http://10.0.0.1/' },
    })
    expect(result.error).toMatch(/private\/loopback/)
  })
})

describe('builtin: calculator (no eval)', () => {
  it('evaluates basic arithmetic', async () => {
    const r = await calculatorTool.execute({ expression: '1 + 2 * 3' })
    expect(r.content).toBe('7')
  })

  it('handles parentheses', async () => {
    const r = await calculatorTool.execute({ expression: '(1 + 2) * 3' })
    expect(r.content).toBe('9')
  })

  it('handles unary minus', async () => {
    const r = await calculatorTool.execute({ expression: '-5 + 3' })
    expect(r.content).toBe('-2')
  })

  it('handles exponent (right-associative)', async () => {
    const r = await calculatorTool.execute({ expression: '2 ** 3 ** 2' })
    expect(r.content).toBe('512') // 2^(3^2) = 2^9
  })

  it('rejects malicious code injection attempt', async () => {
    // 这种字符在解析器里会被识别为非法 token
    const r = await calculatorTool.execute({
      expression: 'process.exit(1)',
    })
    expect(r.error).toBeDefined()
  })

  it('rejects division by zero', async () => {
    const r = await calculatorTool.execute({ expression: '1 / 0' })
    expect(r.error).toMatch(/Division by zero/)
  })
})

describe('builtin: get_current_time', () => {
  it('returns ISO when no timezone', async () => {
    const r = await getCurrentTimeTool.execute({})
    expect(r.content).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('rejects invalid timezone', async () => {
    const r = await getCurrentTimeTool.execute({ timezone: 'Not/A/Real/Zone' })
    expect(r.error).toBeDefined()
  })
})
