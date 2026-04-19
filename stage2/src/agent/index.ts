/**
 * Agent 核心
 * Agent = LLM + Prompt + Tools + Memory
 * 核心循环：用户输入 -> 思考是否调用工具 -> 执行工具 -> 继续或返回结果
 */

import { EventEmitter } from 'events';
import { LLMClient, createLLMClient } from '../api/llm.js';
import { ChatMessage } from '../api/types.js';
import {
  executeToolCall,
  getAllToolDefinitions,
  ToolCall,
  ToolResult
} from '../tools/index.js';
import { MemoryManager } from '../memory/index.js';

// ==================== 类型定义 ====================

export interface AgentConfig {
  systemPrompt?: string;
  maxIterations?: number;
  stream?: boolean;
}

export interface AgentResponse {
  content: string;
  toolCalls?: ToolCall[];
  iterations: number;
}

// ==================== Agent 实现 ====================

/**
 * Agent 核心类
 */
export class Agent extends EventEmitter {
  private llm: LLMClient;
  private memory: MemoryManager;
  private config: Required<AgentConfig>;
  private systemPrompt: string;

  constructor(
    llm: LLMClient,
    memory: MemoryManager,
    config: AgentConfig = {}
  ) {
    super();
    this.llm = llm;
    this.memory = memory;
    this.config = {
      systemPrompt: config.systemPrompt ?? this.getDefaultSystemPrompt(),
      maxIterations: config.maxIterations ?? 5,
      stream: config.stream ?? false,
    };
    this.systemPrompt = this.config.systemPrompt;
  }

  getMessageCount(): number {
    return this.memory.shortTerm.size;
  }

  /**
   * 默认的系统提示词
   */
  private getDefaultSystemPrompt(): string {
    return `你是一个智能助手。当用户提问时：
1. 如果问题需要实时信息（如新闻、天气、时间），调用 search_web 或 get_current_time 工具
2. 如果用户要求查看文件内容，调用 read_local_file 工具
3. 如果问题可以直接回答，直接回答即可

重要：只返回 tool_calls，当用户的问题不需要工具时，直接回答。`;
  }

  /**
   * 处理用户输入并返回响应
   */
  async process(userInput: string): Promise<AgentResponse> {
    // 添加用户消息到记忆
    this.memory.addUserMessage(userInput);

    // 构建消息列表
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...this.memory.getContext().map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content
      }))
    ];

    const tools = getAllToolDefinitions();
    let iterations = 0;
    let finalContent = '';

    while (iterations < this.config.maxIterations) {
      iterations++;

      // 调用 LLM
      const response = await this.llm.chat(messages, tools);

      // 如果 LLM 返回了工具调用
      if (response.toolCalls && response.toolCalls.length > 0) {
        this.emit('toolCall', response.toolCalls);

        // 执行所有工具调用
        const toolResults = await this.executeTools(response.toolCalls);

        // 将助手消息和工具结果添加到消息历史
        messages.push({
          role: 'assistant',
          content: response.content ?? '',
          tool_calls: response.toolCalls.map((call) => ({
            id: call.id,
            type: 'function',
            function: {
              name: call.name,
              arguments: JSON.stringify(call.arguments)
            }
          }))
        });

        for (const result of toolResults) {
          messages.push({
            role: 'tool',
            name: result.name,
            tool_call_id: result.callId,
            content: JSON.stringify(result)
          });
        }

        // 继续循环，让 LLM 根据工具结果生成最终回答
        continue;
      }

      // 没有工具调用，直接返回回答
      finalContent = response.content;
      this.memory.addAssistantMessage(finalContent);
      break;
    }

    if (iterations >= this.config.maxIterations) {
      finalContent = '抱歉，问题太复杂，我需要更多时间思考。';
    }

    return {
      content: finalContent,
      iterations
    };
  }

  /**
   * 流式处理用户输入
   */
  async processStream(
    userInput: string,
    onChunk: (delta: string) => void
  ): Promise<AgentResponse> {
    this.memory.addUserMessage(userInput);

    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...this.memory.getContext().map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content
      }))
    ];

    const tools = getAllToolDefinitions();
    let iterations = 0;
    let finalContent = '';

    while (iterations < this.config.maxIterations) {
      iterations++;

      // 先用流式调用检查是否有工具调用意图
      // 简化：先同步判断，再流式输出
      const response = await this.llm.chat(messages, tools);

      if (response.toolCalls && response.toolCalls.length > 0) {
        this.emit('toolCall', response.toolCalls);

        const toolResults = await this.executeTools(response.toolCalls);

        messages.push({
          role: 'assistant',
          content: response.content ?? '',
          tool_calls: response.toolCalls.map((call) => ({
            id: call.id,
            type: 'function',
            function: {
              name: call.name,
              arguments: JSON.stringify(call.arguments)
            }
          }))
        });

        for (const result of toolResults) {
          messages.push({
            role: 'tool',
            name: result.name,
            tool_call_id: result.callId,
            content: JSON.stringify(result)
          });
        }

        // 继续循环
        continue;
      }

      // 没有工具调用，流式输出
      finalContent = response.content;
      await this.llm.streamChat(messages, onChunk);
      this.memory.addAssistantMessage(finalContent);
      break;
    }

    return { content: finalContent, iterations };
  }

  /**
   * 执行工具调用
   */
  private async executeTools(calls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const call of calls) {
      console.log(`[Agent] 调用工具: ${call.name}`, call.arguments);
      const result = await executeToolCall(call);
      results.push({ ...result, callId: call.id });
      this.emit('toolResult', result);
    }

    return results;
  }

  /**
   * 创建 Agent 实例（工厂函数）
   */
  static create(config?: AgentConfig): Agent {
    const llm = createLLMClient();
    const memory = new MemoryManager();
    return new Agent(llm, memory, config);
  }
}
