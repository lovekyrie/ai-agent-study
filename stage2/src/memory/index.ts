/**
 * 记忆管理系统
 * - 短期记忆：数组维护最近 N 轮对话
 * - 长期记忆：向量数据库（预留接口，当前为简单实现）
 */

import { ChatMessage } from '../api/types.js';

// ==================== 类型定义 ====================

export interface MemoryConfig {
  /** 短期记忆保留轮数 */
  shortTermMaxTurns?: number;
}

export interface MemoryEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

// ==================== 短期记忆 ====================

/**
 * 短期记忆管理器
 * 使用数组维护最近 N 轮对话
 */
export class ShortTermMemory {
  private history: MemoryEntry[] = [];
  private maxTurns: number;

  constructor(maxTurns: number = 10) {
    this.maxTurns = maxTurns;
  }

  /**
   * 添加用户消息
   */
  addUser(content: string): void {
    this.history.push({
      role: 'user',
      content,
      timestamp: Date.now()
    });
    this.trim();
  }

  /**
   * 添加助手消息
   */
  addAssistant(content: string): void {
    this.history.push({
      role: 'assistant',
      content,
      timestamp: Date.now()
    });
    this.trim();
  }

  /**
   * 获取对话历史（用于发送给 LLM）
   */
  getHistory(): MemoryEntry[] {
    return [...this.history];
  }

  /**
   * 获取最近的 N 条消息
   */
  getRecentMessages(n: number = 10): MemoryEntry[] {
    return this.history.slice(-n);
  }

  /**
   * 清空历史
   */
  clear(): void {
    this.history = [];
  }

  /**
   * 裁剪超出的历史
   */
  private trim(): void {
    if (this.history.length > this.maxTurns * 2) {
      this.history = this.history.slice(-this.maxTurns * 2);
    }
  }

  /**
   * 获取历史总条数
   */
  get size(): number {
    return this.history.length;
  }
}

// ==================== 长期记忆（向量数据库接口） ====================

/**
 * 长期记忆管理器
 * 预留接口，当前为简单实现
 * 后续可接入 Chroma / Pinecone / pgvector
 */
export class LongTermMemory {
  private vectors: Array<{
    id: string;
    content: string;
    vector: number[];
    timestamp: number;
  }> = [];

  /**
   * 添加记忆
   */
  async add(id: string, content: string, embedding: number[]): Promise<void> {
    this.vectors.push({
      id,
      content,
      vector: embedding,
      timestamp: Date.now()
    });
  }

  /**
   * 搜索相似记忆
   * 当前使用简单余弦相似度
   */
  async search(queryEmbedding: number[], topK: number = 3): Promise<string[]> {
    // 简化实现：返回所有记忆的 content
    // 实际应计算余弦相似度并排序
    return this.vectors
      .slice(-topK)
      .map(v => v.content);
  }

  /**
   * 清空所有记忆
   */
  clear(): void {
    this.vectors = [];
  }

  /**
   * 获取记忆数量
   */
  get size(): number {
    return this.vectors.length;
  }
}

// ==================== 统一记忆接口 ====================

/**
 * 记忆管理器
 * 整合短期和长期记忆
 */
export class MemoryManager {
  shortTerm: ShortTermMemory;
  longTerm: LongTermMemory;
  private config: MemoryConfig;

  constructor(config: MemoryConfig = {}) {
    this.config = {
      shortTermMaxTurns: config.shortTermMaxTurns ?? 10
    };
    this.shortTerm = new ShortTermMemory(this.config.shortTermMaxTurns);
    this.longTerm = new LongTermMemory();
  }

  /**
   * 添加用户消息
   */
  addUserMessage(content: string): void {
    this.shortTerm.addUser(content);
  }

  /**
   * 添加助手消息
   */
  addAssistantMessage(content: string): void {
    this.shortTerm.addAssistant(content);
  }

  /**
   * 获取完整上下文用于 LLM
   */
  getContext(): MemoryEntry[] {
    return this.shortTerm.getHistory();
  }

  /**
   * 获取带长期记忆的上下文
   */
  async getContextWithLongTerm(queryEmbedding?: number[]): Promise<MemoryEntry[]> {
    const shortTermContext = this.shortTerm.getHistory();

    if (!queryEmbedding) {
      return shortTermContext;
    }

    // 如果有查询向量，检索长期记忆并追加
    const relevantMemories = await this.longTerm.search(queryEmbedding, 3);

    if (relevantMemories.length === 0) {
      return shortTermContext;
    }

    // 将长期记忆作为系统消息注入
    const memoryInjection: MemoryEntry = {
      role: 'system',
      content: `相关记忆：\n${relevantMemories.join('\n---\n')}`,
      timestamp: Date.now()
    };

    return [memoryInjection, ...shortTermContext];
  }

  /**
   * 清空所有记忆
   */
  reset(): void {
    this.shortTerm.clear();
    this.longTerm.clear();
  }
}
