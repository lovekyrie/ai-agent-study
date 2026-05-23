# 2026-05-23 学习笔记：for await...of

## Q1: app.ts 里 `for await (const chunk of ...stream())` 是什么语法？

**上下文**：`backend/apps/api/src/app.ts:252`

**要点**：
- ES2018 异步迭代 `for await...of`
- `stream()` 是 `async*` 返回的 AsyncGenerator
- 每 yield 一个 chunk，循环 await 一次，适合 LLM 流式输出

**详文**：[../typescript/for-await-async-generator.md](../typescript/for-await-async-generator.md)
