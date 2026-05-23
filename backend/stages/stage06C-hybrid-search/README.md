# Stage 06C: Hybrid Search

把“只靠向量”的 RAG 升级为 hybrid retrieval：BM25 lexical search + vector search + fusion + rerank 前指标对比。

## 核心能力

- `InMemoryLexicalIndex`：教学版 BM25，用来理解倒排索引和词项统计
- `HybridRetriever`：融合 vector results 和 lexical results
- 支持 weighted fusion 和 RRF
- 后续接 Elasticsearch 时替换 lexical index 即可

## 运行

```bash
pnpm --filter stage06c-hybrid-search test
pnpm --filter stage06c-hybrid-search dev
```

## 验收

- 能解释 BM25 适合精确词匹配，embedding 适合语义召回
- 能用同一批 chunks 跑 weighted fusion 和 RRF
- 能说明接 Elasticsearch 后替换的边界
