# Stage 06: RAG Foundations

> 把 RAG 拆成 5 个可独立测试的组件 + 一个组合式入口 `AdvancedRAG`。本阶段是后续 stage07（Agentic RAG）/ stage10（评估）的"地基"。

## 学习目标

- 用 `chunkText` / `chunkCode` / `chunkByFile` 处理三种典型分块场景，知道为什么 chunk overlap 必须小于 chunk size
- 用 `Embedder` 在"openai"和"stub"两种模式间切换：有 API key 用真实嵌入、没 API key 用确定性哈希向量做 pipeline 形状验证
- 用 `QueryRewriter` 把用户 query 扩展成多个变体（提高 recall），并理解 LLM 失败时怎么回退到原 query
- 用 `Reranker` 对粗排结果做 LLM 重排（提高 precision）
- 用 `AdvancedRAG` 组合上面所有组件，跑完整的 `index → retrieve → rerank` 链路
- 用 4 个**检索评估指标**（Precision@k / Recall@k / Hit Rate / MRR）量化 RAG 质量

## 前置知识

- 完成 [Stage 05](../stage05-memory-context/README.md)（理解 `LongTermStore` 接口；本阶段相当于一个真实的实现）
- 熟悉 cosine 相似度、向量索引基础

## 核心概念

### 1. Chunking（`chunking.ts`）

```ts
// 按段落分（兜底按字符）
const textChunks = chunkText(text, 'doc.md', { chunkSize: 1000, chunkOverlap: 200 })

// 按行分（适合代码）
const codeChunks = chunkCode(code, 'src.ts', 'typescript', { chunkSize: 50, chunkOverlap: 10 })

// 自动选策略
const auto = chunkByFile(content, 'unknown.txt', 'txt')
```

**关键约束**：`chunkOverlap < chunkSize`，否则报错（防止死循环）。

### 2. Embedding（`embeddings.ts`）

```ts
// 有 API key → 真 OpenAI text-embedding-3-small
const real = new Embedder() // 自动检测 OPENAI_API_KEY

// 没 API key → 哈希伪向量（仅做 pipeline 形状测试，无语义）
const stub = new Embedder({ provider: 'stub', dimensions: 64 })

const results = await embedder.embed(['hello', 'world'])
// EmbeddingResult: { id, embedding, content, metadata }
```

**为什么有 stub 模式？** CI / 本地开发 / 教学场景常常没 key；stub 让 `AdvancedRAG.index()` 和 `retrieve()` 仍然可以跑、可以测，只是召回的"语义相关性"是假的（同一段文本会自检索成功，因为 hash 相同）。

### 3. QueryRewriter（`query-rewriter.ts`）

```ts
const rewriter = new QueryRewriter({ numQueries: 3 })
const expanded = await rewriter.expand('how does typescript handle types')
// → ['how does typescript handle types',
//    'TypeScript type system explanation',
//    'TypeScript static typing mechanism']
```

**降级**：LLM 失败时回退到 `[原 query]`，不抛错（让 RAG 链路保持可运行）。

### 4. Reranker（`reranker.ts`）

```ts
const reranker = new Reranker()
const reranked = await reranker.rerank(query, searchResults, topK)
// 用 LLM 给每条结果打 0-10 分并重新排序
```

### 5. AdvancedRAG（`index.ts` + `InMemoryVectorStore`）

```ts
const rag = new AdvancedRAG({
  embedder: new Embedder(),
  vectorStore: new InMemoryVectorStore(),
  defaultTopK: 10,
  rerankTopK: 5,
})

await rag.index(chunks)

const result = await rag.retrieve('user query', {
  useRewrite: true, // 多 query 召回 + 分数融合
  useRerank: true, // LLM 重排
})
```

**多 query 融合策略**：每个文档累计 `scoreSum` + `hits`，最终按 `scoreSum / hits` 排序——只除"命中查询数"而不是"总查询数"，避免单查询命中的文档被压低。

### 6. 检索评估（`test/retrieval-eval.test.ts`）

四个最常用的指标 + 一个 golden set 框架：

```ts
function evaluateRetrieval(retrieved, goldenCases, k): {
  hitRate: number // 至少命中一个的 query 比例
  precisionAtK: number // 检索结果里相关文档的比例
  recallAtK: number // 相关文档被召回的比例
  mrr: number // 第一个相关文档排名的倒数
}
```

任何 chunk size / model / rerank 改动都应该在固定 golden set 上跑这 4 个指标对比。stage10 会扩展成完整评估框架；本阶段只是先把指标"摸到手"。

## 代码组织

```
src/
├── index.ts            # AdvancedRAG + InMemoryVectorStore + barrel
├── chunking.ts         # chunkText / chunkCode / chunkByFile
├── embeddings.ts       # Embedder（openai / stub 双模式）+ pseudoVector + cosineSimilarity
├── query-rewriter.ts   # QueryRewriter（LLM 多 query 扩展）
├── reranker.ts         # Reranker（LLM 重排）
└── example.ts          # 端到端 demo
```

依赖关系：`AdvancedRAG` 把上面 4 个组件用构造器注入的方式组合起来；任何一个都可以单独 `new`、单独测试、单独替换实现（生产里 `Embedder` 换 `text-embedding-3-large`、`vectorStore` 换 Chroma/Qdrant）。

## 验收清单

- [ ] 能解释为什么 stub 模式下"相同文本自检索一定命中"是合理的 sanity check
- [ ] 能口述 `AdvancedRAG.retrieve` 在 `useRewrite=true` 时如何融合多 query 分数
- [ ] 能区分 Precision@k 和 Recall@k 在不同场景的优先级
- [ ] 知道 chunk overlap 太大会发生什么（死循环）
- [ ] `pnpm --filter stage06-rag-foundations test` 50 个测试全部通过

## 快速开始

```bash
# 跑测试（不需要 API Key）
pnpm --filter stage06-rag-foundations test

# 跑完整 demo（无 API Key 自动 fallback 到 stub embedder）
pnpm --filter stage06-rag-foundations dev

# 跑评估测试单独看
pnpm exec vitest run stages/stage06-rag-foundations/test/retrieval-eval.test.ts
```

## 与下一阶段的衔接

- `stage07-agentic-rag` 让 LLM 决定**怎么用** RAG（多 KB 路由、混合搜索）
- `stage10-evals` 把这里的 4 个指标扩展成完整评估框架（含 LLM-as-judge）
- `stage11-production` 把 `InMemoryVectorStore` 替换成真实向量库 + cache 层
