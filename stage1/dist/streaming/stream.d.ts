/**
 * SSE (Server-Sent Events) 流式处理工具
 * 用于将 LLM 返回的数据块实时推送到前端
 */
import { EventEmitter } from 'events';
/**
 * SSE 事件发射器
 * 将流式数据转换为标准 SSE 格式
 */
export declare class SSEEmitter extends EventEmitter {
    private buffer;
    /**
     * 发送一个数据块
     */
    sendChunk(content: string): void;
    /**
     * 结束流
     */
    end(): void;
    /**
     * 发送错误
     */
    error(err: Error): void;
    /**
     * 将内容转为 SSE 格式字符串
     */
    static toSSEMessage(event: string, data: string): string;
    /**
     * 将错误转为 SSE 格式字符串
     */
    static toSSEError(message: string): string;
}
/**
 * 创建一个 SSE 响应的 Transform 流
 * 用于 Express/Koa 等框架中pipe到response对象
 */
export declare function createSSEStream(): NodeJS.WritableStream & {
    emit(event: 'data', chunk: string): boolean;
    emit(event: 'end'): boolean;
    emit(event: 'error', err: Error): boolean;
};
//# sourceMappingURL=stream.d.ts.map