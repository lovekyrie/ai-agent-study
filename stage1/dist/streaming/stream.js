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
    buffer = [];
    /**
     * 发送一个数据块
     */
    sendChunk(content) {
        this.buffer.push(content);
        this.emit('data', content);
    }
    /**
     * 结束流
     */
    end() {
        this.emit('end', this.buffer.join(''));
    }
    /**
     * 发送错误
     */
    error(err) {
        this.emit('error', err);
    }
    /**
     * 将内容转为 SSE 格式字符串
     */
    static toSSEMessage(event, data) {
        return `event: ${event}\ndata: ${JSON.stringify({ content: data })}\n\n`;
    }
    /**
     * 将错误转为 SSE 格式字符串
     */
    static toSSEError(message) {
        return `event: error\ndata: ${JSON.stringify({ message })}\n\n`;
    }
}
/**
 * 创建一个 SSE 响应的 Transform 流
 * 用于 Express/Koa 等框架中pipe到response对象
 */
export function createSSEStream() {
    return new Writable({
        write(chunk, encoding, callback) {
            const content = chunk.toString();
            process.stdout.write(content);
            callback();
        }
    });
}
//# sourceMappingURL=stream.js.map