# Stage 12: GraphRAG

GraphRAG 用知识图谱补强普通 RAG 的跨实体关系推理能力。本阶段先实现内存图谱，后续可替换为 Neo4j。

## 核心能力

- entity / relation upsert
- neighbor traversal
- path search
- graph context + text context 合并

## 运行

```bash
pnpm --filter stage12-graph-rag test
pnpm --filter stage12-graph-rag dev
```

## Neo4j 替换点

当前 `KnowledgeGraph` 是内存实现；生产版本把 `upsertEntity`、`upsertRelation`、`neighbors`、`findPaths` 映射到 Cypher。
