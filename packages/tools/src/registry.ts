import type {
  LLMToolDefinition,
  ToolCallRequest,
  ToolDefinition,
  ToolExecutionContext,
  ToolResult,
} from './types.js'
import { ZodError } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

function formatZodError(err: ZodError): string {
  return err.issues.map(i => `${i.path.join('.') || '<root>'}: ${i.message}`).join('; ')
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map()
  private context: ToolExecutionContext

  constructor(context?: Partial<ToolExecutionContext>) {
    this.context = {
      permissions: [],
      metadata: {},
      ...context,
    }
  }

  register(tool: ToolDefinition): this {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`)
    }
    this.tools.set(tool.name, tool)
    return this
  }

  registerAll(tools: ToolDefinition[]): this {
    for (const tool of tools) this.register(tool)
    return this
  }

  unregister(name: string): boolean {
    return this.tools.delete(name)
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  listByCategory(category: string): ToolDefinition[] {
    return this.list().filter(t => t.category === category)
  }

  listCategories(): string[] {
    const categories = new Set<string>()
    for (const tool of this.tools.values()) {
      if (tool.category)
        categories.add(tool.category)
    }
    return Array.from(categories)
  }

  setContext(context: Partial<ToolExecutionContext>): void {
    this.context = { ...this.context, ...context }
  }

  /** 返回深拷贝，避免外部意外修改 registry 内部上下文 */
  getContext(): ToolExecutionContext {
    return {
      ...this.context,
      permissions: [...this.context.permissions],
      metadata: { ...this.context.metadata },
    }
  }

  async execute(request: ToolCallRequest): Promise<ToolResult> {
    const tool = this.tools.get(request.name)
    if (!tool) {
      return {
        content: '',
        error: `Tool "${request.name}" not found. Available: ${this.list()
          .map(t => t.name)
          .join(', ')}`,
      }
    }

    if (tool.requiresApproval && !this.context.permissions.includes('approve')) {
      return {
        content: '',
        error: `Tool "${tool.name}" requires approval permission`,
      }
    }

    // 1) 参数校验
    let params: unknown
    try {
      params = tool.parameters.parse(request.arguments)
    }
    catch (error) {
      if (error instanceof ZodError) {
        return {
          content: '',
          error: `Tool "${tool.name}" parameter validation failed: ${formatZodError(error)}`,
        }
      }
      return {
        content: '',
        error: `Tool "${tool.name}" parameter validation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }

    // 2) 实际执行（与校验错误分开，避免误报"参数校验失败"）
    try {
      return await tool.execute(params as Record<string, unknown>, this.context)
    }
    catch (error) {
      return {
        content: '',
        error: `Tool "${tool.name}" execution failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }
  }

  /** 并行执行；单个失败不影响其他（每个 reject 也被映射成 ToolResult.error） */
  async executeBatch(requests: ToolCallRequest[]): Promise<ToolResult[]> {
    return Promise.all(requests.map(req => this.execute(req)))
  }

  /** 转成 OpenAI function calling 标准格式（真正的 JSON Schema） */
  toLLMFormat(): LLMToolDefinition[] {
    return this.list().map((tool) => {
      const schema = zodToJsonSchema(tool.parameters, { target: 'openApi3' }) as Record<
        string,
        unknown
      >
      // zod-to-json-schema 会包一层 { $schema, ...rest }，剥掉 $schema 让格式更干净
      const { $schema: _ignored, ...cleaned } = schema
      const description
        = tool.requiresApproval && !tool.description.includes('requires approval')
          ? `${tool.description} (requires approval)`
          : tool.description
      return {
        type: 'function' as const,
        function: {
          name: tool.name,
          description,
          parameters: cleaned,
        },
      }
    })
  }
}
