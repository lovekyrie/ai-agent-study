import type { ChatMessage, LLMClient } from '@ai-agent-study/llm-client'
import type {
  AgentConfig,
  AgentExecutionResult,
  AgentExecutor,
  WorkflowContext,
} from './types.js'
import { createLLMClient } from '@ai-agent-study/llm-client'

export class SupervisorAgent implements AgentExecutor {
  protected agentConfig: AgentConfig
  protected listNodes: () => { id: string, type: string, name: string }[]
  private cachedClient?: LLMClient

  constructor(
    config: AgentConfig,
    listNodes: () => { id: string, type: string, name: string }[],
    llmClient?: LLMClient,
  ) {
    this.agentConfig = config
    this.listNodes = listNodes
    this.cachedClient = llmClient
  }

  protected getClient(): LLMClient {
    if (!this.cachedClient)
      this.cachedClient = createLLMClient()
    return this.cachedClient
  }

  async execute(context: WorkflowContext): Promise<AgentExecutionResult> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a ${this.agentConfig.role}. ${this.agentConfig.instructions}

Current workflow state: ${context.state}
Current node: ${context.currentNode}
Available nodes: ${JSON.stringify(this.listNodes())}

Analyze the current state and decide what specialist to delegate to next, or if the task is complete.`,
      },
      {
        role: 'user',
        content: `Task context: ${JSON.stringify(context.data, null, 2)}

What should happen next? Provide your decision and any necessary actions.`,
      },
    ]

    try {
      const response = await this.getClient().chat(messages)
      const decision = this.parseSupervisorDecision(response.content)

      if (decision.handoff) {
        return {
          success: true,
          output: response.content,
          handoff: {
            to: decision.handoff,
            reason: decision.reason || 'Supervisor delegated to specialist',
            context: context.data,
          },
        }
      }

      return { success: true, output: response.content }
    }
    catch (error) {
      return {
        success: false,
        output: error instanceof Error ? error.message : String(error),
      }
    }
  }

  protected parseSupervisorDecision(content: string): { handoff?: string, reason?: string } {
    const handoffMatch = content.match(/handoff:\s*([\w-]+)/i) || content.match(/delegate to:\s*([\w-]+)/i)
    const reasonMatch = content.match(/reason:(.+)/i)

    if (handoffMatch) {
      return {
        handoff: handoffMatch[1].trim(),
        reason: reasonMatch ? reasonMatch[1].trim() : undefined,
      }
    }

    return {}
  }
}

export class SpecialistAgent implements AgentExecutor {
  protected agentConfig: AgentConfig
  private cachedClient?: LLMClient

  constructor(config: AgentConfig, llmClient?: LLMClient) {
    this.agentConfig = config
    this.cachedClient = llmClient
  }

  protected getClient(): LLMClient {
    if (!this.cachedClient)
      this.cachedClient = createLLMClient()
    return this.cachedClient
  }

  async execute(context: WorkflowContext): Promise<AgentExecutionResult> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a ${this.agentConfig.role}. ${this.agentConfig.instructions}`,
      },
      {
        role: 'user',
        content: `Task: ${JSON.stringify(context.data, null, 2)}

Complete your specialized task and report the results. If you need to handoff back to the supervisor, indicate "handoff:supervisor" in your response.`,
      },
    ]

    try {
      const response = await this.getClient().chat(messages)

      const isHandoff = /handoff:supervisor/i.test(response.content)
      if (isHandoff) {
        return {
          success: true,
          output: response.content,
          handoff: {
            to: 'supervisor',
            reason: 'Specialist completed task, returning to supervisor',
            context: context.data,
          },
        }
      }

      return { success: true, output: response.content }
    }
    catch (error) {
      return {
        success: false,
        output: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
