import type { ChatMessage, LLMClient } from '@ai-agent-study/llm-client'
import type { ToolCallRequest, ToolDefinition } from '@ai-agent-study/tools'
import type {
  AgentConfig,
  AgentResponse,
  AgentStatus,
  AgentStep,
  ExecutionTrace,
} from './types.js'
import {

  createLLMClient,

} from '@ai-agent-study/llm-client'
import { ToolRegistry } from '@ai-agent-study/tools'

const DEFAULT_SYSTEM_PROMPT = `你是一个智能助手，可以通过工具调用来完成多步任务。

工作流程（ReAct 循环）：
- Thought（思考）：判断下一步该做什么
- Action（行动）：必要时调用一个或多个工具
- Observation（观察）：基于工具返回结果继续推理
- 直到能给出最终答案为止

注意：当你能给出最终答案时，请直接回复用户，不再调用工具。`

/**
 * Agent: ReAct loop runtime.
 *
 * 单个 Agent 实例可以被多次 run()，每次 run() 都返回完整的 trace，
 * 不在实例上保留状态（避免 trace 与 task 错配）。
 */
export class Agent {
  private readonly registry: ToolRegistry
  private readonly config: Required<
    Omit<AgentConfig, 'systemPrompt' | 'llmClient' | 'tools' | 'permissions' | 'signal' | 'onStep'>
  > & {
    systemPrompt: string
    permissions: string[]
  }

  private readonly providedClient: LLMClient | undefined
  private cachedClient: LLMClient | undefined
  private readonly onStep?: (step: AgentStep) => void
  private readonly abortSignal?: AbortSignal

  constructor(config: AgentConfig = {}) {
    this.registry = new ToolRegistry({ permissions: config.permissions ?? [] })
    if (config.tools && config.tools.length > 0) {
      this.registry.registerAll(config.tools)
    }
    this.providedClient = config.llmClient
    this.onStep = config.onStep
    this.abortSignal = config.signal
    this.config = {
      maxIterations: config.maxIterations ?? 10,
      maxTokensPerIteration: config.maxTokensPerIteration ?? 2000,
      temperature: config.temperature ?? 0.7,
      systemPrompt: config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      permissions: config.permissions ?? [],
    }
  }

  /** 惰性获取 LLM 客户端，避免 import Agent 即触发 env 读取 */
  private getClient(): LLMClient {
    if (this.providedClient)
      return this.providedClient
    if (!this.cachedClient)
      this.cachedClient = createLLMClient()
    return this.cachedClient
  }

  getTools(): ToolDefinition[] {
    return this.registry.list()
  }

  registerTool(tool: ToolDefinition): this {
    this.registry.register(tool)
    return this
  }

  async run(task: string): Promise<AgentResponse> {
    const steps: AgentStep[] = []
    const llmTools = this.registry.toLLMFormat()
    const messages: ChatMessage[] = [
      { role: 'system', content: this.config.systemPrompt },
      { role: 'user', content: task },
    ]

    let status: AgentStatus = 'thinking'
    let finalMessage = ''
    let iterations = 0

    try {
      while (iterations < this.config.maxIterations) {
        iterations++
        this.abortSignal?.throwIfAborted?.()

        const response = await this.getClient().chat(messages, {
          tools: llmTools.length > 0 ? llmTools : undefined,
          maxTokens: this.config.maxTokensPerIteration,
          temperature: this.config.temperature,
          signal: this.abortSignal,
        })

        const step: AgentStep = {
          stepNumber: iterations,
          thought: response.content ?? '',
          toolCalls: [],
          toolResults: [],
          finishReason: response.finishReason,
        }

        // 模型没请求工具 → 拿到最终答案，结束
        if (!response.toolCalls || response.toolCalls.length === 0) {
          finalMessage = response.content
          status = 'done'
          steps.push(step)
          this.onStep?.(step)
          break
        }

        // 1) 把 assistant 消息（含 tool_calls）写回历史（OpenAI 协议契约）
        messages.push({
          role: 'assistant',
          content: response.content,
          tool_calls: response.toolCalls,
        })

        // 2) 并行执行所有 tool_calls
        const requests: ToolCallRequest[] = response.toolCalls.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          arguments: safeParseJson(tc.function.arguments),
        }))
        step.toolCalls = requests

        const results = await this.registry.executeBatch(requests)
        step.toolResults = results

        // 3) 每个 tool_call 必须对应一条 role:'tool' 消息（OpenAI 强约束）
        for (let i = 0; i < requests.length; i++) {
          const req = requests[i]
          const res = results[i]
          messages.push({
            role: 'tool',
            tool_call_id: req.id ?? '',
            content: res.error ? `ERROR: ${res.error}` : res.content,
          })
        }

        steps.push(step)
        this.onStep?.(step)
      }

      if (iterations >= this.config.maxIterations && status === 'thinking') {
        status = 'max_iterations'
        finalMessage = `任务在 ${iterations} 轮后仍未完成。`
      }
    }
    catch (error) {
      const lastStep = steps.at(-1)
      const errMsg = error instanceof Error ? error.message : String(error)
      if (lastStep)
        lastStep.error = errMsg
      status = 'error'
      finalMessage = `执行出错: ${errMsg}`
    }

    const trace: ExecutionTrace = {
      task,
      steps,
      iterations,
      status,
      finalMessage,
    }

    return { status, message: finalMessage, trace }
  }
}

function safeParseJson(raw: string): Record<string, unknown> {
  if (!raw || raw.trim() === '')
    return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  }
  catch {
    return { __raw: raw }
  }
}
