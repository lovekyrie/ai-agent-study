/**
 * 向量数据库 (Chroma)
 * 存储和快速检索向量
 */

import { ChromaClient, Collection } from 'chromadb';
import { EmbeddingsClient, createEmbeddingsClient } from '../embeddings/index.js';
import { Chunk } from '../chunking/index.js';

// ==================== 类型定义 ====================

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

// ==================== Chroma 向量存储 ====================

export class VectorStore {
  private client: ChromaClient;
  private collectionName: string;
  private collection: Collection | null = null;
  private embeddings: EmbeddingsClient;

  constructor(
    embeddings: EmbeddingsClient,
    config: VectorStoreConfig = {}
  ) {
    this.client = new ChromaClient({
      path: config.persistDirectory ?? 'http://localhost:8000'
    });
    this.collectionName = config.collectionName ?? 'knowledge-base';
    this.embeddings = embeddings;
  }

  /**
   * 初始化/获取 Collection
   */
  async getCollection(): Promise<Collection> {
    if (this.collection) {
      return this.collection;
    }

    try {
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: { description: 'Knowledge base embeddings' }
      });
      return this.collection;
    } catch (error) {
      console.error('[VectorStore] Failed to get collection:', error);
      throw error;
    }
  }

  /**
   * 添加文本块到向量库
   */
  async addChunks(chunks: Chunk[]): Promise<void> {
    const collection = await this.getCollection();

    // 批量获取 embeddings
    const texts = chunks.map(c => c.content);
    const { results } = await this.embeddings.embedBatch(texts);

    // 准备 Chroma 格式数据
    const ids = chunks.map(c => c.id);
    const metadatas = chunks.map(c => c.metadata);
    const documents = chunks.map(c => c.content);

    // 添加到 Collection
    await collection.add({
      ids,
      embeddings: results.map(r => r.embedding),
      metadatas,
      documents,
    });

    console.log(`[VectorStore] Added ${chunks.length} chunks`);
  }

  /**
   * 搜索相似文本
   */
  async search(query: string, topK: number = 5): Promise<SearchResult[]> {
    const collection = await this.getCollection();

    // 获取查询的 embedding
    const { embedding } = await this.embeddings.embed(query);

    // 执行相似度搜索
    const results = await collection.query({
      queryEmbeddings: [embedding],
      nResults: topK,
      include: ['distances', 'metadatas', 'documents'] as const,
    });

    // 格式化结果
    const searchResults: SearchResult[] = [];

    if (results.ids && results.ids[0]) {
      for (let i = 0; i < results.ids[0].length; i++) {
        searchResults.push({
          id: results.ids[0][i],
          content: results.documents?.[0]?.[i] ?? '',
          metadata: results.metadatas?.[0]?.[i] ?? {},
          distance: results.distances?.[0]?.[i] ?? 0,
        });
      }
    }

    return searchResults;
  }

  /**
   * 清空 Collection
   */
  async clear(): Promise<void> {
    try {
      await this.client.deleteCollection({ name: this.collectionName });
      this.collection = null;
      console.log(`[VectorStore] Cleared collection: ${this.collectionName}`);
    } catch (error) {
      console.warn('[VectorStore] Clear failed:', error);
    }
  }

  /**
   * 获取 Collection 统计信息
   */
  async getStats(): Promise<{ count: number; name: string }> {
    const collection = await this.getCollection();
    return {
      count: collection.count ? await collection.count() : 0,
      name: this.collectionName,
    };
  }
}

// ==================== 工厂函数 ====================

export function createVectorStore(): VectorStore {
  const embeddings = createEmbeddingsClient();
  const persistDir = process.env.CHROMA_PATH ?? './data/chroma';
  return new VectorStore(embeddings, {
    persistDirectory: persistDir,
    collectionName: 'knowledge-base',
  });
}
