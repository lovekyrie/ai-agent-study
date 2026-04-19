/**
 * Embeddings (文本向量化)
 * 调用大模型的 Embedding 模型，把文字变成多维数字向量
 */
export interface EmbeddingConfig {
    apiKey: string;
    baseURL?: string;
    model?: string;
    dimensions?: number;
}
export interface EmbeddingResult {
    embedding: number[];
    tokenCount: number;
}
export interface BatchEmbeddingResult {
    results: EmbeddingResult[];
    totalTokens: number;
}
export declare class EmbeddingsClient {
    private client;
    private model;
    private dimensions;
    constructor(config: EmbeddingConfig);
    /**
     * 单文本 embedding
     */
    embed(text: string): Promise<EmbeddingResult>;
    /**
     * 批量 embedding（更高效）
     */
    embedBatch(texts: string[]): Promise<BatchEmbeddingResult>;
    /**
     * 估算 token 数（粗略估算，中英文不同）
     */
    static estimateTokens(text: string): number;
}
export declare function createEmbeddingsClient(): EmbeddingsClient;
