# Stage 07: Agentic RAG

> 把 stage06 的固定检索 pipeline 升级成"LLM 决定怎么检索"的可塑模式。三个独立的范式：规划式 / 路由式 / 算法融合式。

## 学习目标

- 理解"Agentic"在 RAG 里的真正含义：不是 ReAct loop，而是 **LLM 做决策、执行确定**
- 用 `AgenticRAG` 把"规划 → 检索 → 综合"拆成三步，每步可独立测试
- 用 `MultiKnowledgeRouter` 在多 KB 之间选 primary + secondary
- 用 `HybridSearchEngine` 把向量 + 关键词召回的分数 min-max 归一化后加权融合
- 知道为什么 LLM 失败时**所有**类都有兜底降级路径（不会爆炸式失败）

## 前置知识

- 完成 [Stage 06](../stage06-rag-foundations/README.md)（理解 chunk/embed/rerank/查询改写）
- 熟悉 `@ai-agent-study/llm-client` 的 `chat({ jsonMode })`
- 熟悉 `@ai-agent-study/vectorstore` 的 `SearchResult` 结构

## 与 Stage 04 的关系

stage04 的 `Agent` 是 **ReAct 循环 + 工具调用**：模型可以反复调用工具直到完成。

stage07 是另一种范式：**结构化的 plan-execute-synthesize**。
- 没有循环，每个 query 固定走 3 步
- 没有工具调用，KB 是"被规划"的对象
- LLM 只在两个点出现：规划（输出 JSON）+ 综合（输出答案）

两者解决不同问题：stage04 适合"开放任务"（写代码、查多源），stage07 适合"问答型 RAG"（检索 + 引用）。

## 核心概念

### 1. AgenticRAG（`agentic-rag.ts`）

```ts
const rag = new AgenticRAG({ maxTopK: 20 })
rag.registerKnowledgeBase(kbA)
rag.registerKnowledgeBase(kbB)

// 三步分别可调用
const plan = await rag.planRetrieval('how does X work') // LLM 规划
const sources = await rag.retrieveWithPlan(plan) // 确定性执行
const research = await rag.runResearch('how does X work') // 一次性走完
// research = { message, steps, sources, plan }
```

**降级策略**：
- 没注册 KB → 返回空 plan（topK=0）
- LLM 调用失败 → 降级为"全部 KB / topK=10 / hybrid=true"
- LLM 返回的 KB 名不在已注册集合 → 过滤掉
- LLM 返回的 topK 不合理（NaN / 超大）→ 夹紧到 [1, maxTopK]

### 2. MultiKnowledgeRouter（`router.ts`）

```ts
const router = new MultiKnowledgeRouter()
router.register(docsKB)
router.register(wikiKB)
router.register(apiKB)

const { primary, secondary } = await router.route('how to authenticate')
// primary?.name === 'api'
// secondary[0]?.name === 'docs'
```

**与 AgenticRAG 的取舍**：
- AgenticRAG: "我要查这几个 KB"，并行检索后融合
- Router: "这个 KB 是主的，那些是辅助的"，调用方自己决定怎么用

### 3. HybridSearchEngine（`hybrid-search.ts`）

```ts
const hybrid = new HybridSearchEngine(vectorKB, keywordKB, {
  vectorWeight: 0.7,
  keywordWeight: 0.3,
  overFetchMultiplier: 2,
})

const fused = await hybrid.search('typescript generics', 10)
```

**算法**：
1. 各 KB 取 `topK * overFetchMultiplier` 条候选
2. 对每个 KB 的分数做 min-max 归一化（消除尺度差异）
3. 加权求和，按总分排序，截 topK

**注意点**：完全无 LLM 参与；这是"算法层"的 hybrid，与 stage06 的 `QueryRewriter` 互补（一个改 query、一个改打分）。

## 代码组织

```
src/
├── index.ts          # 公共导出（薄 barrel）
├── types.ts          # KnowledgeBase / RetrievalPlan / ResearchResponse
├── agentic-rag.ts    # AgenticRAG（plan + retrieve + synthesize）
├── router.ts         # MultiKnowledgeRouter
├── hybrid-search.ts  # HybridSearchEngine
└── example.ts        # 三种模式的端到端 demo
```

依赖关系：三个类完全独立，各自只依赖 `types.ts` + 框架 `packages/*`。

## 验收清单

- [ ] 能区分 stage04 的 ReAct loop 和 stage07 的 plan-execute-synthesize
- [ ] 不看代码也能说出 `AgenticRAG` 在 LLM 失败时的兜底行为
- [ ] 知道为什么 hybrid search 必须先做 min-max 归一化
- [ ] 知道 `Router` 在 KB 数量为 0/1 时直接短路（不调 LLM）
- [ ] `pnpm --filter stage07-agentic-rag test` 12 个测试全部通过

## 快速开始

```bash
# 跑测试（不需要 API Key，全部用 mock LLMClient）
pnpm --filter stage07-agentic-rag test

# 跑完整 demo（无 API Key 时会跳过 runResearch 的 LLM 综合步骤）
OPENAI_API_KEY=sk-... pnpm --filter stage07-agentic-rag dev
```

## 与下一阶段的衔接

- `stage08-mcp` 把"KB / Tool"统一抽象到 MCP 协议（不再每家系统造轮子）
- `stage09-workflow` 多 Agent 协作时，每个 Agent 可以挂自己的 AgenticRAG
- `stage11-production` 把 InMemory KB 替换成真实向量库 + 持久化的 SearchResult cache
