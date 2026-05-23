# Stage 07A: LangGraph Agentic RAG

用 LangGraph 思路把 RAG 拆成状态图：plan → retrieve → grade → rewrite → answer。本阶段先实现无外部依赖的状态图 runner，后续可替换为真正 LangGraph。

## 核心能力

- 显式 `AgenticRAGState`
- node 级执行记录
- relevance grading
- query rewrite retry
- final answer synthesis

## 运行

```bash
pnpm --filter stage07a-langgraph-agentic-rag test
pnpm --filter stage07a-langgraph-agentic-rag dev
```

## 验收

- 能解释为什么图状态比隐式递归更容易观测
- 能看懂 rewrite retry 的触发条件
- 后续接 LangGraph 时只替换 runner，不替换业务 node
