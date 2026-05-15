# Stage 6: Agentic RAG

Agentic RAG - Agent 自己决定检索策略。构建在 Stage 5 高级 RAG 之上，加入 Agent 决策能力。

## 核心功能

- **RAG as Tool**: RAG 作为 Agent 的工具，Agent 决定何时检索
- **Multi-Knowledge Base Routing**: 根据查询路由到最合适的知识库
- **SQL + Vector Hybrid**: 结合结构化查询和向量搜索
- **Web Search + Local Docs**: 混合外部搜索和本地文档
- **Research Agent**: 研究型 Agent，自动规划检索并生成报告

## 目录结构

```
src/
├── index.ts  # 主类: AgenticRAG, MultiKnowledgeRouter, HybridSearchEngine
```

## 核心类

### AgenticRAG

研究型 RAG Agent，自动规划检索策略：

```typescript
const rag = new AgenticRAG()
rag.registerKnowledgeBase(kb)
const response = await rag.runResearch('your query')
```

### MultiKnowledgeRouter

多知识库路由器，根据查询内容选择最相关的知识库：

```typescript
const router = new MultiKnowledgeRouter()
router.register(kb1)
router.register(kb2)
const { primary, secondary } = await router.route('query')
```

### HybridSearchEngine

混合搜索引擎，结合向量搜索和关键词搜索：

```typescript
const hybrid = new HybridSearchEngine(vectorKB, keywordKB)
const results = await hybrid.search('query', topK)
```

## 与 Stage 5 的区别

| Feature | Stage 5 | Stage 6 |
|---------|---------|---------|
| 检索策略 | 固定 | Agent 决定 |
| 知识库 | 单个 | 多个 |
| 搜索类型 | 向量 | 向量 + 关键词混合 |
| 查询处理 | 改写 | 路由 + 改写 |
| 结果合成 | 简单合并 | Agent 合成 |