# Stage 06A: Data Ingestion

把 RAG 前置的 ingestion 工程补齐：Loader、清洗、Splitter、metadata、去重和可重复索引。

## 核心能力

- `MemoryDocumentLoader` / `FileSystemDocumentLoader`
- Markdown heading splitter、code line splitter、character splitter
- chunk metadata：`source`、`extension`、`heading`、`line range`、`hash`
- 内容级 dedupe，避免重复索引同一段资料

## 运行

```bash
pnpm --filter stage06a-data-ingestion test
pnpm --filter stage06a-data-ingestion dev
```

## 验收

- 能把一批文档稳定拆成 chunk
- 能解释不同 splitter 的适用场景
- 每个 chunk 都可以追溯来源和 hash
