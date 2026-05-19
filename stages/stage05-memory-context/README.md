# Stage 05: Memory & Context Engineering

> 把 `packages/memory` 的两个原语升级成 Agent 可以真正用起来的"上下文管线"。stage04 解决了"会跑"，本阶段解决"跑得久不爆 token"。

## 学习目标

- 用 `TokenEstimator` 估算消息成本，知道 `chars/4` 和 CJK-aware 估算的差异
- 用 `enforceBudget` 做"被动兜底"裁剪——一旦超出 token 预算，从最早的非 system 消息开始丢
- 用 `summarizeHistory` 做"主动压缩"——让 LLM 把旧对话浓缩成一段 system 摘要
- 用 `buildContext` 把 system / 摘要 / 长期检索 / 短期记忆 一次性整合
- 用 `Session` 容器统一管理一次会话的完整生命周期

## 前置知识

- 完成 [Stage 04](../stage04-agent-runtime/README.md)（理解 ReAct loop 和 messages 数组）
- 熟悉 `@ai-agent-study/llm-client` 的 `ChatMessage` 协议

## 核心概念

### 1. Token 估算（`token-budget.ts`）

```ts
import { defaultEstimator, cjkEstimator, estimateMessages } from './index'

defaultEstimator.estimate('hello world')   // 3  (chars/4, ceil)
cjkEstimator.estimate('你好世界')          // 4  (每个 CJK ~1 token)
estimateMessages(messages)                 // 含 3 token priming + 每条 4 token framing
```

**为什么不直接用 `tiktoken`？** 本阶段重点是 API 形状与裁剪策略；`tiktoken` 是 Wasm 包，会拖慢 stage 启动。生产环境再接入。

### 2. 被动兜底裁剪（`enforceBudget`）

```ts
const result = enforceBudget(messages, {
  maxTokens: 4000,
  reservedForResponse: 1000,   // 预留给 LLM 生成
  preserveSystem: true,        // 首条 system 永远保留
})
// result: { messages, tokensUsed, tokensBudget, trimmedCount }
```

**裁剪策略**：从最新一条往前收集，超出 `(maxTokens - reservedForResponse)` 就停止；至少保留 1 条非 system 消息（避免上下文全丢）。

### 3. 主动 LLM 摘要（`summarizer.ts`）

```ts
const result = await summarizeHistory(messages, llmClient, {
  keepRecent: 4,                   // 最近 4 条不压缩
  previousSummary: prev,           // 增量摘要：合并旧摘要 + 新对话
  maxTokens: 500,                  // 给摘要本身的预算
})
// result.messages: [system, [历史摘要] xxx, m17, m18, m19, m20]
```

约定：摘要节点以 `'[历史摘要] '` 开头，`isSummaryMessage()` 可识别。

### 4. 上下文拼装（`context-builder.ts`）

```ts
const result = await buildContext({
  systemPrompt: '你是助手',
  summary: '过去 30 轮总结：...',     // 可选
  shortTerm: stm,
  longTermStore: vectorStore,        // 可选
  retrievalQuery: '用户在问什么',     // 触发长期检索
  budget: { maxTokens: 4000 },
})
```

**消息顺序**：`[main system] → [历史摘要] → [相关历史片段] → [短期对话…]`，摘要和检索都用 `role:'system'` 注入，让模型把它们当"背景资料"而非"对话历史"。

### 5. Session 容器（`session.ts`）

```ts
const session = Session.withInMemoryLongTerm({
  systemPrompt: '你是助手',
  maxShortTerm: 50,
  llmClient: createLLMClient(),   // 调 compress() 时才需要
})

session.addUserMessage('hi')
session.addAssistantMessage('你好')

// 让某条短期消息"晋升"到长期
const fact = session.addUserMessage('我住在北京')
await session.promoteToLongTerm(fact.id)

// 主动压缩
const { summary, summarizedCount, keptCount } = await session.compress({ keepRecent: 4 })

// 一次性拿到最终 messages（含所有整合 + budget）
const { messages, tokensUsed } = await session.getMessagesForLLM({
  retrievalQuery: '北京',
  budget: { maxTokens: 2000 },
})
```

**关键设计取舍**：

- Session 不持久化（stage11 接 Postgres / Redis 再做）
- `compress()` 用增量摘要：每次都把上一轮的 summary 喂给 LLM 合并，避免信息累积丢失
- `getMessagesForLLM()` 是唯一的"对外出口"，把 4 类信息 + budget 一次性整合

### 6. 上下文注入防护（与 stage02 / stage03 呼应）

- **角色边界**：摘要和检索结果都用 `role:'system'`，但内容以 `[历史摘要]` / `[相关历史片段]` 显式标注，模型不会把它们当"用户说的话"
- **顶部 system 优先**：调用方提供的 `systemPrompt` 永远在队首，不可被注入的"上下文"覆盖
- 完整注入防护（用户输入清理）在 stage02、tool 注入防护在 stage03，本阶段不重复

## 代码组织

```
src/
├── index.ts                # 公共导出
├── token-budget.ts         # TokenEstimator + enforceBudget
├── summarizer.ts           # LLM 摘要压缩 + isSummaryMessage
├── context-builder.ts      # buildContext 总入口
├── session.ts              # Session 容器（栈顶 API）
└── example.ts              # 50 轮对话端到端 demo
```

依赖关系：`session` → `context-builder` + `summarizer` + `token-budget`；都通过 `packages/memory` 复用 `ShortTermMemory` / `LongTermStore`。

## 验收清单

- [ ] 能解释"被动兜底"和"主动压缩"两种策略的触发时机
- [ ] 知道 `compress()` 在没有 `llmClient` 或短期记忆不够时返回 `null` 而不是抛错
- [ ] 知道增量摘要如何用 `previousSummary` 累积，避免信息丢失
- [ ] 不看代码也能口述 `buildContext` 输出的消息顺序
- [ ] `pnpm --filter stage05-memory-context test` 35 个测试全部通过

## 快速开始

```bash
# 跑测试（不需要 API Key）
pnpm --filter stage05-memory-context test

# 跑完整 demo（无 API Key 也能跑大部分，含 compress() 会自动跳过）
pnpm --filter stage05-memory-context dev
```

## 与下一阶段的衔接

- `stage06-rag-foundations` 会用真正的向量化 `LongTermStore` 替换 `InMemoryLongTerm`
- `stage07-agentic-rag` 让 Agent 自己决定"什么时候触发 `retrievalQuery`"
- `stage11-production` 把 `Session` 接到真实存储（Postgres + Redis）
