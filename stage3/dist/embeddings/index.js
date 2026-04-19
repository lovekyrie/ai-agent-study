/**
 * Embeddings (文本向量化)
 * 调用大模型的 Embedding 模型，把文字变成多维数字向量
 */
import { config } from 'dotenv';
import axios from 'axios';
config();
// ==================== Embeddings 客户端 ====================
export class EmbeddingsClient {
    client;
    model;
    dimensions;
    constructor(config) {
        this.client = axios.create({
            baseURL: config.baseURL ?? 'https://api.openai.com/v1',
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 60000,
        });
        this.model = config.model ?? 'text-embedding-3-small';
        this.dimensions = config.dimensions ?? 1536;
    }
    /**
     * 单文本 embedding
     */
    async embed(text) {
        const response = await this.client.post('/embeddings', {
            input: text,
            model: this.model,
            dimensions: this.dimensions,
        });
        const data = response.data.data[0];
        const usage = response.data.usage;
        return {
            embedding: data.embedding,
            tokenCount: usage?.prompt_tokens ?? 0,
        };
    }
    /**
     * 批量 embedding（更高效）
     */
    async embedBatch(texts) {
        // OpenAI 批量限制 2048 个，这里做个安全限制
        const batchSize = 100;
        const results = [];
        let totalTokens = 0;
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const response = await this.client.post('/embeddings', {
                input: batch,
                model: this.model,
                dimensions: this.dimensions,
            });
            const embeddings = response.data.data;
            const usage = response.data.usage;
            for (const item of embeddings) {
                results.push({
                    embedding: item.embedding,
                    tokenCount: 0, // 批量不计每条 token 数
                });
            }
            totalTokens += usage?.prompt_tokens ?? 0;
        }
        return { results, totalTokens };
    }
    /**
     * 估算 token 数（粗略估算，中英文不同）
     */
    static estimateTokens(text) {
        // 简单估算：中文约 1.5 token/字，英文约 4 token/词
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
        const englishWords = (text.match(/[a-zA-Z]+/g) ?? []).length;
        return Math.ceil(chineseChars * 1.5 + englishWords / 4);
    }
}
// ==================== 工厂函数 ====================
export function createEmbeddingsClient() {
    const apiKey = process.env.OPENAI_API_KEY ?? '';
    const baseURL = process.env.OPENAI_API_BASE ?? 'https://api.openai.com/v1';
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not set');
    }
    return new EmbeddingsClient({ apiKey, baseURL });
}
//# sourceMappingURL=index.js.map