/**
 * 向量数据库 (Chroma)
 * 存储和快速检索向量
 */
import { Collection } from 'chromadb';
import { EmbeddingsClient } from '../embeddings/index.js';
import { Chunk } from '../chunking/index.js';
export interface VectorStoreConfig {
    persistDirectory?: string;
    collectionName?: string;
}
export interface SearchResult {
    id: string;
    content: string;
    metadata: Record<string, unknown>;
    distance: number;
}
export declare class VectorStore {
    private client;
    private collectionName;
    private collection;
    private embeddings;
    constructor(embeddings: EmbeddingsClient, config?: VectorStoreConfig);
    /**
     * 初始化/获取 Collection
     */
    getCollection(): Promise<Collection>;
    /**
     * 添加文本块到向量库
     */
    addChunks(chunks: Chunk[]): Promise<void>;
    /**
     * 搜索相似文本
     */
    search(query: string, topK?: number): Promise<SearchResult[]>;
    /**
     * 清空 Collection
     */
    clear(): Promise<void>;
    /**
     * 获取 Collection 统计信息
     */
    getStats(): Promise<{
        count: number;
        name: string;
    }>;
}
export declare function createVectorStore(): VectorStore;
