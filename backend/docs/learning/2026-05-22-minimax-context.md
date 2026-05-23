# 2026-05-22 学习笔记：MiniMax 上下文与 maxTokens

## Q1: MiniMax-M2.7 最大上下文可以设置多大？

**上下文**：`packages/config/src/schemas.ts` 第 8–9 行

**要点**：
- 模型总上下文窗口：**204,800 tokens**（输入+输出合计）
- 配置项 `maxTokens` 是 API 的 `max_tokens`，指**单次输出上限**，不是整窗
- schema 里 `.max(200_000)` 是校验上限，默认 1000
- 实际：`maxTokens ≤ 204800 - 输入token数`

**详文**：[../packages/config/max-tokens-vs-context.md](../packages/config/max-tokens-vs-context.md)
