# 2026-05-22 学习笔记：loader 测试单包 vs 全量

## Q1: 为什么 `--filter config test` 通过，根目录 `pnpm test` 却失败？

**上下文**：`packages/config/test/loader.test.ts` 第 72–77 行

**要点**：
- 失败用例：`delete process.env.OPENAI_API_KEY` 后期望 `loadConfig()` 抛错
- `loadConfig()` 内每次调用 `dotenv.config()`，delete 后 key 不存在，dotenv 会从 cwd 下 `.env` 补回
- 根目录跑测试 cwd=仓库根，有 `.env` → key 被补回 → 不抛错
- 单包跑测试 cwd 常在 `packages/config`，无 `.env` → 仍抛错

**详文**：[../packages/config/loader-test-cwd-dotenv.md](../packages/config/loader-test-cwd-dotenv.md)
