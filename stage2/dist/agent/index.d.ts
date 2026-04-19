/**
 * Agent 核心
 * Agent = LLM + Prompt + Tools + Memory
 * 核心循环：用户输入 -> 思考是否调用工具 -> 执行工具 -> 继续或返回结果
 */
import { EventEmitter } from 'events';
import { LLMClient } from '../api/llm.js';
import { ToolCall } from '../tools/index.js';
import { MemoryManager } from '../memory/index.js';
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
/**
 * Agent 核心类
 */
export declare class Agent extends EventEmitter {
    private llm;
    private memory;
    private config;
    private systemPrompt;
    constructor(llm: LLMClient, memory: MemoryManager, config?: AgentConfig);
    getMessageCount(): number;
    /**
     * 默认的系统提示词
     */
    private getDefaultSystemPrompt;
    /**
     * 处理用户输入并返回响应
     */
    process(userInput: string): Promise<AgentResponse>;
    /**
     * 流式处理用户输入
     */
    processStream(userInput: string, onChunk: (delta: string) => void): Promise<AgentResponse>;
    /**
     * 执行工具调用
     */
    private executeTools;
    /**
     * 创建 Agent 实例（工厂函数）
     */
    static create(config?: AgentConfig): Agent;
}
