/**
 * 多模型统一接口 - 支持 OpenAI 兼容格式
 * 封装不同模型的 API 调用，统一 temperature、top_p、max_tokens 等参数
 */
import { EventEmitter } from 'events';
export interface LLMConfig {
    apiKey: string;
    baseURL: string;
    model: string;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
}
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export interface ChatOptions {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    stream?: boolean;
}
export interface StreamChunk {
    delta: string;
    done: boolean;
}
/**
 * 统一 LLM 客户端
 * 支持 OpenAI 兼容格式的 API 调用
 */
export declare class LLMClient extends EventEmitter {
    private client;
    private model;
    private defaultOptions;
    constructor(config: LLMConfig);
    /**
     * 同步调用 — 等待完整响应
     */
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
    /**
     * 流式调用 — 通过 SSE 实时接收数据块
     * 返回 EventEmitter，可监听 'chunk' 和 'done' 事件
     */
    streamChat(messages: ChatMessage[], options?: ChatOptions): EventEmitter;
    /**
     * 使用 EventSource 进行流式调用（浏览器环境）
     * 这里主要用于 SSE 事件的标准化处理
     */
    static parseSSEMessage(data: string): StreamChunk | null;
}
/**
 * 工厂函数 — 创建默认配置的 LLM 客户端
 */
export declare function createLLMClient(): LLMClient;
//# sourceMappingURL=models.d.ts.map