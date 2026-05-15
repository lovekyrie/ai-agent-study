# AI Codebase Agent

智能代码库问答助手，基于 RAG 和多Agent架构。

## 核心能力

- **代码索引**: 自动解析 TypeScript/JavaScript/Python 代码，提取函数、类、接口
- **语义搜索**: 基于向量相似度的代码检索，支持 reranking
- **智能问答**: 使用 LLM 基于检索到的代码片段生成答案
- **引用追踪**: 答案附带文件位置和代码片段引用

## 技术架构

```
┌─────────────────────────────────────────────────┐
│                 CodebaseAgent                    │
├─────────────────────────────────────────────────┤
│  CodeIndexer     │  CodeRetriever  │    LLM    │
│  - 文件扫描       │  - 向量存储       │  - GPT-4 │
│  - 代码解析       │  - 相似度搜索     │  - 答案生成│
│  - Chunk提取      │  - Reranking     │           │
├─────────────────────────────────────────────────┤
│                 VectorStore                      │
│              (InMemory/Chroma)                   │
└─────────────────────────────────────────────────┘
```

## 核心组件

### CodeIndexer
```typescript
const indexer = new CodeIndexer({
  includePatterns: ['**/*.ts'],
  excludePatterns: ['**/node_modules/**'],
  chunkSize: 1000,
})
const project = await indexer.indexProject('/path/to/code', 'MyProject')
```

### CodeRetriever
```typescript
const retriever = new CodeRetriever(vectorStore, {
  topK: 5,
  minScore: 0.5,
  rerank: true,
})
const results = await retriever.search('authentication', projectId)
```

### CodebaseAgent
```typescript
const agent = new CodebaseAgent(retriever)
const { projectId } = await agent.indexProject('./myapp', 'My App')
const answer = await agent.ask('How is auth handled?', projectId)
```

## 使用示例

```typescript
import { CodebaseAgent, InMemoryVectorStore } from '@ai-agent-study/codebase-agent'

async function main() {
  // 1. 创建组件
  const vectorStore = new InMemoryVectorStore()
  const retriever = new CodeRetriever(vectorStore)
  const agent = new CodebaseAgent(retriever)

  // 2. 索引项目
  const { projectId, stats } = await agent.indexProject('./my-project', 'My App')
  console.log(`Indexed ${stats.filesIndexed} files`)

  // 3. 提问
  const result = await agent.ask('How is authentication implemented?', projectId)
  console.log(result.answer)
  console.log('Sources:', result.sources)
  console.log('References:', result.references)

  // 4. 查看统计
  const stats = await agent.getStats(projectId)
}
```

## 评估指标

| 指标 | 说明 |
|------|------|
| Retrieval Precision | 检索结果相关性 |
| Answer Faithfulness | 答案与源码的一致性 |
| Citation Accuracy | 引用准确性 |

## 简历亮点

- 构建基于 TypeScript 的 AI Agent Runtime，支持 tool calling、RAG、memory、MCP
- 设计 Agent 评估体系，覆盖 tool success rate、retrieval precision、answer faithfulness
- 支持多语言代码索引 (TypeScript/JavaScript/Python)

## 下一步

- 集成 GitHub MCP 实现 PR 代码审查
- 添加代码修改建议生成
- 实现执行轨迹可视化