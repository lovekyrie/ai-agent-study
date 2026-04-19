/**
 * LLM 客户端 - 封装 OpenAI 兼容格式 API
 */
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export interface LLMConfig {
    apiKey: string;
    baseURL: string;
    model: string;
}
export declare class LLMClient {
    private client;
    private model;
    constructor(config: LLMConfig);
    /**
     * 同步调用
     */
    chat(messages: ChatMessage[], options?: {
        temperature?: number;
        maxTokens?: number;
    }): Promise<{
        content: string;
    }>;
    /**
     * 流式调用
     */
    streamChat(messages: ChatMessage[], onChunk: (delta: string) => void, options?: {
        temperature?: number;
        maxTokens?: number;
    }): Promise<void>;
}
export declare function createLLMClient(): LLMClient;
