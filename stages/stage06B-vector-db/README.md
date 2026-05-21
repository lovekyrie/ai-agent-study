# Stage 06B: Vector DB

把 `stage06` 的 in-memory store 升级成 adapter 结构，默认保留内存 fallback，同时提供 `ChromaVectorStore` 接真实 Chroma 服务。

## 核心能力

- `VectorStoreAdapter`：统一 `upsert/search/delete/deleteByFilter/stats`
- `InMemoryVectorStoreAdapter`：测试和本地 fallback
- `ChromaVectorStore`：通过 Chroma SDK 接真实 collection
- 支持按 source 删除，方便增量重建

## 运行

```bash
pnpm --filter stage06b-vector-db test
pnpm --filter stage06b-vector-db dev
```

## 生产替换点

真实环境把 `InMemoryVectorStoreAdapter` 换成：

```ts
new ChromaVectorStore({ collectionName: 'agent_docs', path: 'http://localhost:8000' })
```
