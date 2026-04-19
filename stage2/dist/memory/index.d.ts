/**
 * 记忆管理系统
 * - 短期记忆：数组维护最近 N 轮对话
 * - 长期记忆：向量数据库（预留接口，当前为简单实现）
 */
export interface MemoryConfig {
    /** 短期记忆保留轮数 */
    shortTermMaxTurns?: number;
}
export interface MemoryEntry {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}
/**
 * 短期记忆管理器
 * 使用数组维护最近 N 轮对话
 */
export declare class ShortTermMemory {
    private history;
    private maxTurns;
    constructor(maxTurns?: number);
    /**
     * 添加用户消息
     */
    addUser(content: string): void;
    /**
     * 添加助手消息
     */
    addAssistant(content: string): void;
    /**
     * 获取对话历史（用于发送给 LLM）
     */
    getHistory(): MemoryEntry[];
    /**
     * 获取最近的 N 条消息
     */
    getRecentMessages(n?: number): MemoryEntry[];
    /**
     * 清空历史
     */
    clear(): void;
    /**
     * 裁剪超出的历史
     */
    private trim;
    /**
     * 获取历史总条数
     */
    get size(): number;
}
/**
 * 长期记忆管理器
 * 预留接口，当前为简单实现
 * 后续可接入 Chroma / Pinecone / pgvector
 */
export declare class LongTermMemory {
    private vectors;
    /**
     * 添加记忆
     */
    add(id: string, content: string, embedding: number[]): Promise<void>;
    /**
     * 搜索相似记忆
     * 当前使用简单余弦相似度
     */
    search(queryEmbedding: number[], topK?: number): Promise<string[]>;
    /**
     * 清空所有记忆
     */
    clear(): void;
    /**
     * 获取记忆数量
     */
    get size(): number;
}
/**
 * 记忆管理器
 * 整合短期和长期记忆
 */
export declare class MemoryManager {
    shortTerm: ShortTermMemory;
    longTerm: LongTermMemory;
    private config;
    constructor(config?: MemoryConfig);
    /**
     * 添加用户消息
     */
    addUserMessage(content: string): void;
    /**
     * 添加助手消息
     */
    addAssistantMessage(content: string): void;
    /**
     * 获取完整上下文用于 LLM
     */
    getContext(): MemoryEntry[];
    /**
     * 获取带长期记忆的上下文
     */
    getContextWithLongTerm(queryEmbedding?: number[]): Promise<MemoryEntry[]>;
    /**
     * 清空所有记忆
     */
    reset(): void;
}
