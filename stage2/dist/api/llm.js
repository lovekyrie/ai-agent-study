/**
 * LLM 客户端 - 封装 OpenAI 兼容格式 API
 */
import axios from 'axios';
import { config } from 'dotenv';
config();
export class LLMClient {
    client;
    model;
    defaultOptions;
    constructor(config) {
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
            temperature: 0.7,
            maxTokens: 1000,
            stream: false,
        };
    }
    /**
     * 同步调用 - 等待完整响应
     */
    async chat(messages, tools, options) {
        const opts = { ...this.defaultOptions, ...options };
        const requestBody = {
            model: this.model,
            messages,
            temperature: opts.temperature,
            max_tokens: opts.maxTokens,
        };
        if (tools.length > 0) {
            requestBody.tools = tools.map((tool) => ({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters
                }
            }));
        }
        const response = await this.client.post('/chat/completions', requestBody);
        const message = response.data.choices[0]?.message;
        if (message?.tool_calls) {
            return {
                content: message.content ?? '',
                toolCalls: message.tool_calls.map((tc, index) => {
                    let parsedArgs = {};
                    try {
                        parsedArgs = JSON.parse(tc.function.arguments ?? '{}');
                    }
                    catch {
                        parsedArgs = {};
                    }
                    return {
                        id: tc.id ?? `tool_call_${index}`,
                        name: tc.function.name,
                        arguments: parsedArgs
                    };
                })
            };
        }
        return { content: message?.content ?? '' };
    }
    /**
     * 流式调用 - 通过回调实时接收数据块
     */
    async streamChat(messages, onChunk, options) {
        const opts = { ...this.defaultOptions, ...options, stream: true };
        const response = await this.client.post('/chat/completions', {
            model: this.model,
            messages,
            temperature: opts.temperature,
            max_tokens: opts.maxTokens,
            stream: true,
        }, {
            responseType: 'stream',
        });
        const stream = response.data;
        let buffer = '';
        return new Promise((resolve, reject) => {
            stream.on('data', (chunk) => {
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
                        }
                        catch {
                            // Skip invalid JSON
                        }
                    }
                }
            });
            stream.on('end', resolve);
            stream.on('error', reject);
        });
    }
}
/**
 * 工厂函数 - 创建默认配置的 LLM 客户端
 */
export function createLLMClient() {
    const apiKey = process.env.OPENAI_API_KEY ?? '';
    const baseURL = process.env.OPENAI_API_BASE ?? 'https://api.openai.com/v1';
    const model = process.env.DEFAULT_MODEL ?? 'gpt-4';
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not set in environment variables');
    }
    return new LLMClient({ apiKey, baseURL, model });
}
//# sourceMappingURL=llm.js.map