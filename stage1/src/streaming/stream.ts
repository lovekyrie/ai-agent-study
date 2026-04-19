/**
 * SSE (Server-Sent Events) 流式处理工具
 * 用于将 LLM 返回的数据块实时推送到前端
 */

import { EventEmitter } from 'events';
import { Writable } from 'stream';

/**
 * SSE 事件发射器
 * 将流式数据转换为标准 SSE 格式
 */
export class SSEEmitter extends EventEmitter {
  private buffer: string[] = [];

  /**
   * 发送一个数据块
   */
  sendChunk(content: string): void {
    this.buffer.push(content);
    this.emit('data', content);
  }

  /**
   * 结束流
   */
  end(): void {
    this.emit('end', this.buffer.join(''));
  }

  /**
   * 发送错误
   */
  error(err: Error): void {
    this.emit('error', err);
  }

  /**
   * 将内容转为 SSE 格式字符串
   */
  static toSSEMessage(event: string, data: string): string {
    return `event: ${event}\ndata: ${JSON.stringify({ content: data })}\n\n`;
  }

  /**
   * 将错误转为 SSE 格式字符串
   */
  static toSSEError(message: string): string {
    return `event: error\ndata: ${JSON.stringify({ message })}\n\n`;
  }
}

/**
 * 创建一个 SSE 响应的 Transform 流
 * 用于 Express/Koa 等框架中pipe到response对象
 */
export function createSSEStream(): NodeJS.WritableStream & {
  emit(event: 'data', chunk: string): boolean;
  emit(event: 'end'): boolean;
  emit(event: 'error', err: Error): boolean;
} {
  return new Writable({
    write(chunk: Buffer, encoding: BufferEncoding, callback: () => void) {
      const content = chunk.toString();
      process.stdout.write(content);
      callback();
    }
  }) as NodeJS.WritableStream & {
    emit(event: 'data', chunk: string): boolean;
    emit(event: 'end'): boolean;
    emit(event: 'error', err: Error): boolean;
  };
}
