/**
 * LLM 客户端 - 封装 OpenAI 兼容格式 API
 */
import { ChatMessage, ChatOptions, LLMConfig } from './types.js';
export declare class LLMClient {
    private client;
    private model;
    private defaultOptions;
    constructor(config: LLMConfig);
    /**
     * 同步调用 - 等待完整响应
     */
    chat(messages: ChatMessage[], tools: Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    }>, options?: ChatOptions): Promise<{
        content: string;
        toolCalls?: Array<{
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }>;
    }>;
    /**
     * 流式调用 - 通过回调实时接收数据块
     */
    streamChat(messages: ChatMessage[], onChunk: (delta: string) => void, options?: ChatOptions): Promise<void>;
}
/**
 * 工厂函数 - 创建默认配置的 LLM 客户端
 */
export declare function createLLMClient(): LLMClient;
