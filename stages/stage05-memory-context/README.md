# Stage 05: Memory & Context Engineering

> 状态：**🟡 骨架占位**（学习材料待补，代码取自 `packages/memory`）

## 学习目标

让 Agent "记得住"：跨步骤、跨会话保留必要信息，又不被 Token 预算撑爆。本阶段是 `stage04-agent-runtime` 之后的第一道"上下文质量"分水岭。

## 前置知识

- 已学完 [`stage04-agent-runtime`](../stage04-agent-runtime/README.md) 的 ReAct loop
- 熟悉 `@ai-agent-study/llm-client` 的 `ChatMessage` 协议

## 核心概念

### 1. 短期记忆 (Short-term Memory)
- 滑动窗口 + 重要度评分混合裁剪策略
- 参考实现：`@ai-agent-study/memory` 的 `ShortTermMemory`
- 关键取舍：完全按 importance 排序会丢失"刚刚发生"的对话连贯性 → 用 30% 时间窗保底

### 2. 长期记忆 (Long-term Memory)
- 接口抽象 `LongTermStore`：`add / search / delete / clear`
- 当前实现：`InMemoryLongTerm`（基于子串匹配）
- 生产实现方向：接 `@ai-agent-study/vectorstore`，把 entry 向量化后存

### 3. Token 预算与上下文压缩
- 估算 token：先用粗略的 `chars / 4`，后续可以接 `tiktoken`
- 压缩策略：
  - **截断**：直接保留最近 N 条
  - **摘要**：用 LLM 把旧对话压缩成 1 段摘要
  - **混合**：摘要保底 + 最近原文

### 4. Session 管理
- Session = 一次完整任务的上下文容器（messages + memory + metadata）
- 持久化选项：内存 / 文件 / 数据库（生产化在 `stage11`）

### 5. 上下文注入防护（与 stage02、stage03 安全主题呼应）
- 用户输入混入 system role / tool result 伪造的风险
- Defense: 明确角色边界 + 不可被覆盖的 system 指令位置

## 代码组织（计划）

```
src/
├── index.ts                  # 公共导出
├── short-term-memory.ts      # 移自 packages/memory，加详细注释
├── long-term-memory.ts       # 同上
├── context-builder.ts        # 把 messages + memory 合成最终 ChatMessage[]
├── token-budget.ts           # 预算估算 + 截断策略
├── summarizer.ts             # LLM 摘要压缩
├── session.ts                # 简化的 Session 容器（持久化版在 stage11）
└── example.ts                # 端到端 demo
```

## 与下一阶段的衔接

- `stage06-rag-foundations` 会用到这里的 `LongTermStore` 抽象：把检索到的文档作为"长期记忆"喂给 Agent
- `stage11-production` 会把 `SessionManager` 接到真实存储（Postgres / Redis）

## 验收清单

- [ ] `ShortTermMemory` / `LongTermStore` 提炼并加学习注释
- [ ] `TokenBudget` 提供至少 2 种裁剪策略
- [ ] `Summarizer` 用 LLM 把 N 轮对话压成 1 段
- [ ] `Session` 容器：messages + short-term + long-term 一起管理
- [ ] 至少 6 个单元测试覆盖 trim、search、summarize、防注入
- [ ] `example.ts` 展示"模拟 50 轮对话不爆 token"
