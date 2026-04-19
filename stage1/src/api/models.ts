/**
 * 多模型统一接口 - 支持 OpenAI 兼容格式
 * 封装不同模型的 API 调用，统一 temperature、top_p、max_tokens 等参数
 */

import axios, { AxiosInstance } from 'axios';
import { config } from 'dotenv';
import { EventEmitter } from 'events';

config();

function toReadableError(error: unknown): Error {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const responseData = error.response?.data;
    const payload = responseData === undefined ? '' : ` | response=${JSON.stringify(responseData)}`;
    return new Error(`LLM request failed${status ? ` (HTTP ${status})` : ''}: ${error.message}${payload}`);
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

export interface LLMConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface StreamChunk {
  delta: string;
  done: boolean;
}

/**
 * 统一 LLM 客户端
 * 支持 OpenAI 兼容格式的 API 调用
 */
export class LLMClient extends EventEmitter {
  private client: AxiosInstance;
  private model: string;
  private defaultOptions: ChatOptions;

  constructor(config: LLMConfig) {
    super();
    this.client = axios.create({
      baseURL: config.baseURL,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    });
    this.model = config.model;
    this.defaultOptions = {
      temperature: config.temperature ?? 0.7,
      topP: config.topP ?? 1.0,
      maxTokens: config.maxTokens ?? 1000,
      stream: false,
    };
  }

  /**
   * 同步调用 — 等待完整响应
   */
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    const opts = { ...this.defaultOptions, ...options };
    try {
      const response = await this.client.post('/chat/completions', {
        model: this.model,
        messages,
        temperature: opts.temperature,
        top_p: opts.topP,
        max_tokens: opts.maxTokens,
        stream: false,
      });
      const content = response.data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('LLM API returned an unexpected response payload');
      }
      return content;
    } catch (error) {
      throw toReadableError(error);
    }
  }

  /**
   * 流式调用 — 通过 SSE 实时接收数据块
   * 返回 EventEmitter，可监听 'chunk' 和 'done' 事件
   */
  streamChat(messages: ChatMessage[], options?: ChatOptions): EventEmitter {
    const emitter = new EventEmitter();
    const opts = { ...this.defaultOptions, ...options, stream: true };
    let isDone = false;

    const emitDoneOnce = (): void => {
      if (isDone) {
        return;
      }
      isDone = true;
      emitter.emit('done');
    };

    this.client.post('/chat/completions', {
      model: this.model,
      messages,
      temperature: opts.temperature,
      top_p: opts.topP,
      max_tokens: opts.maxTokens,
      stream: true,
    }, {
      responseType: 'stream',
      headers: {
        'Accept': 'text/event-stream',
      },
    }).then(response => {
      const stream = response.data as NodeJS.ReadableStream;
      let buffer = '';

      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              emitDoneOnce();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content ?? '';
              if (delta) {
                emitter.emit('chunk', delta);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      });

      stream.on('end', () => {
        emitDoneOnce();
      });

      stream.on('error', (err: Error) => {
        emitter.emit('error', err);
        emitDoneOnce();
      });
    }).catch(err => {
      emitter.emit('error', toReadableError(err));
      emitDoneOnce();
    });

    return emitter;
  }

  /**
   * 使用 EventSource 进行流式调用（浏览器环境）
   * 这里主要用于 SSE 事件的标准化处理
   */
  static parseSSEMessage(data: string): StreamChunk | null {
    if (data.startsWith('data: ')) {
      const json = data.slice(6);
      if (json === '[DONE]') {
        return { delta: '', done: true };
      }
      try {
        const parsed = JSON.parse(json);
        return {
          delta: parsed.choices?.[0]?.delta?.content ?? '',
          done: false,
        };
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * 工厂函数 — 创建默认配置的 LLM 客户端
 */
export function createLLMClient(): LLMClient {
  const apiKey = process.env.OPENAI_API_KEY ?? '';
  const baseURL = process.env.OPENAI_API_BASE ?? 'https://api.openai.com/v1';
  const model = process.env.DEFAULT_MODEL ?? 'gpt-4';
  const defaultTemperature = 0.7;
  const defaultMaxTokens = 1000;
  const parsedTemperature = parseFloat(process.env.DEFAULT_TEMPERATURE ?? `${defaultTemperature}`);
  const parsedMaxTokens = parseInt(process.env.DEFAULT_MAX_TOKENS ?? `${defaultMaxTokens}`, 10);
  const temperature = Number.isFinite(parsedTemperature) ? parsedTemperature : defaultTemperature;
  const maxTokens = Number.isFinite(parsedMaxTokens) ? parsedMaxTokens : defaultMaxTokens;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }

  return new LLMClient({ apiKey, baseURL, model, temperature, maxTokens });
}
