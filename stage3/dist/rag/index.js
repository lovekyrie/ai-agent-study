/**
 * RAG 流水线
 * Retrieval-Augmented Generation: 检索 + 生成
 * 流程：用户问题 -> 检索相关文档 -> 构建提示词 -> LLM 生成回答
 */
import { createLLMClient } from '../api/llm.js';
import { createVectorStore } from '../vectorstore/index.js';
// ==================== 默认配置 ====================
const defaultConfig = {
    topK: 5,
    maxContextTokens: 4000,
    systemPromptTemplate: `你是一个基于本地知识库的智能助手。
请根据以下提供的上下文信息回答用户的问题。

**重要**：
1. 只基于提供的上下文回答，不要编造信息
2. 如果上下文中没有相关信息，请明确告知用户
3. 回答要引用相关的文档来源

---上下文---
{context}
---上下文结束---`,
};
// ==================== RAG Pipeline ====================
export class RAGPipeline {
    llm;
    vectorStore;
    config;
    constructor(llm, vectorStore, config = {}) {
        this.llm = llm;
        this.vectorStore = vectorStore;
        this.config = { ...defaultConfig, ...config };
    }
    /**
     * 问答
     */
    async ask(question) {
        // 1. 检索相关文档
        const docs = await this.vectorStore.search(question, this.config.topK);
        if (docs.length === 0) {
            return {
                answer: '抱歉，知识库中没有找到与您问题相关的信息。',
                sources: [],
                retrievalQuery: question,
            };
        }
        // 2. 构建上下文
        const context = this.buildContext(docs);
        // 3. 构建提示词
        const systemPrompt = this.config.systemPromptTemplate.replace('{context}', context);
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question },
        ];
        // 4. 调用 LLM 生成回答
        const response = await this.llm.chat(messages);
        return {
            answer: response.content,
            sources: docs,
            retrievalQuery: question,
        };
    }
    /**
     * 流式问答
     */
    async askStream(question, onChunk) {
        const docs = await this.vectorStore.search(question, this.config.topK);
        if (docs.length === 0) {
            const answer = '抱歉，知识库中没有找到与您问题相关的信息。';
            onChunk(answer);
            return {
                answer,
                sources: [],
                retrievalQuery: question,
            };
        }
        const context = this.buildContext(docs);
        const systemPrompt = this.config.systemPromptTemplate.replace('{context}', context);
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question },
        ];
        await this.llm.streamChat(messages, onChunk);
        return {
            answer: '', // 流式返回时不预先构建完整回答
            sources: docs,
            retrievalQuery: question,
        };
    }
    /**
     * 构建上下文字符串
     */
    buildContext(docs) {
        return docs
            .map((doc, i) => {
            const metadata = doc.metadata;
            const source = metadata?.source ?? 'Unknown';
            const filePath = metadata?.filePath ?? '';
            const chunkIndex = metadata?.chunkIndex ?? 0;
            return `[文档 ${i + 1}] 来源: ${source} (${filePath}, Part ${chunkIndex + 1})
${doc.content}`;
        })
            .join('\n\n');
    }
    /**
     * 工厂函数
     */
    static create(config) {
        const llm = createLLMClient();
        const vectorStore = createVectorStore();
        return new RAGPipeline(llm, vectorStore, config);
    }
}
//# sourceMappingURL=index.js.map