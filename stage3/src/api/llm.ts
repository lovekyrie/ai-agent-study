/**
 * LLM 客户端 - 封装 OpenAI 兼容格式 API
 */

import axios, { AxiosInstance } from 'axios';
import { config } from 'dotenv';

config();

// ==================== 类型定义 ====================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

// ==================== LLM 客户端 ====================

export class LLMClient {
  private client: AxiosInstance;
  private model: string;

  constructor(config: LLMConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    });
    this.model = config.model;
  }

  /**
   * 同步调用
   */
  async chat(
    messages: ChatMessage[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<{ content: string }> {
    const response = await this.client.post('/chat/completions', {
      model: this.model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2000,
    });

    return {
      content: response.data.choices[0]?.message?.content ?? '',
    };
  }

  /**
   * 流式调用
   */
  async streamChat(
    messages: ChatMessage[],
    onChunk: (delta: string) => void,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<void> {
    const response = await this.client.post('/chat/completions', {
      model: this.model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2000,
      stream: true,
    }, {
      responseType: 'stream',
    });

    const stream = response.data as NodeJS.ReadableStream;
    let buffer = '';

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content ?? '';
              if (delta) {
                onChunk(delta);
              }
            } catch {
              // Skip
            }
          }
        }
      });

      stream.on('end', resolve);
      stream.on('error', reject);
    });
  }
}

// ==================== 工厂函数 ====================

export function createLLMClient(): LLMClient {
  const apiKey = process.env.OPENAI_API_KEY ?? '';
  const baseURL = process.env.OPENAI_API_BASE ?? 'https://api.openai.com/v1';
  const model = process.env.DEFAULT_MODEL ?? 'gpt-4';

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  return new LLMClient({ apiKey, baseURL, model });
}
