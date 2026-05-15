# Stage 5: Advanced RAG

高级 RAG 实现，包含 chunking、embedding、hybrid search、rerank 和 query rewrite。

## 核心功能

- **Chunking**: 支持文本（按段落）和代码（按行）两种分块策略
- **Embedding**: 伪嵌入用于开发环境，支持批量处理
- **Hybrid Search**: 结合向量相似度和多查询扩展
- **Rerank**: 使用 LLM 对检索结果进行重排序
- **Query Rewrite**: 将用户查询扩展为多个变体以提高召回率

## 目录结构

```
src/
├── index.ts          # 高级 RAG 主类
├── chunking.ts       # 分块策略
├── embeddings.ts     # 嵌入生成
├── reranker.ts       # LLM 重排序
└── query-rewriter.ts # 查询改写
```

## 使用方法

```typescript
import { AdvancedRAG } from './index.js'
import { chunkText } from './chunking.js'

const rag = new AdvancedRAG()

// 索引文档
const chunks = chunkText(documentContent, 'source.txt')
await rag.index(chunks)

// 检索
const results = await rag.retrieve('your query', useRerank: true)
```

## 运行示例

```bash
pnpm dev
```

## API

### AdvancedRAG

- `index(chunks: Chunk[])`: 索引文档块
- `retrieve(query: string, useRerank?: boolean, useRewrite?: boolean)`: 检索相关文档

### Chunk Functions

- `chunkText(text: string, source: string, options?: Partial<ChunkOptions>)`: 文本分块
- `chunkCode(code: string, source: string, language: string, options?: Partial<ChunkOptions>)`: 代码分块
- `chunkByFile(content: string, source: string, fileType: string)`: 根据文件类型自动选择分块策略