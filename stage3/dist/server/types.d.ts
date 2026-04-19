/**
 * 共享类型定义
 */
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export interface ChatOptions {
    temperature?: number;
    maxTokens?: number;
}
