/**
 * RAG 流水线
 * Retrieval-Augmented Generation: 检索 + 生成
 * 流程：用户问题 -> 检索相关文档 -> 构建提示词 -> LLM 生成回答
 */
import { LLMClient } from '../api/llm.js';
import { VectorStore } from '../vectorstore/index.js';
import { SearchResult } from '../vectorstore/index.js';
export interface RAGConfig {
    /** 检索时返回的最大文档数 */
    topK?: number;
    /** 检索结果的最大 token 数（用于控制上下文长度） */
    maxContextTokens?: number;
    /** 系统提示词模板 */
    systemPromptTemplate?: string;
}
export interface RAGAnswer {
    answer: string;
    sources: SearchResult[];
    retrievalQuery: string;
}
export declare class RAGPipeline {
    private llm;
    private vectorStore;
    private config;
    constructor(llm: LLMClient, vectorStore: VectorStore, config?: RAGConfig);
    /**
     * 问答
     */
    ask(question: string): Promise<RAGAnswer>;
    /**
     * 流式问答
     */
    askStream(question: string, onChunk: (delta: string) => void): Promise<RAGAnswer>;
    /**
     * 构建上下文字符串
     */
    private buildContext;
    /**
     * 工厂函数
     */
    static create(config?: RAGConfig): RAGPipeline;
}
