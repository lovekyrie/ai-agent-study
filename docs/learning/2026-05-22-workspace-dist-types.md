# 2026-05-22 学习笔记：dist 类型入口与 typecheck

## Q1: 没 build 跑 typecheck 为何大量 Cannot find module '@ai-agent-study/xxx'？

**上下文**：workspace 包 `types` 指向 `dist/index.d.ts`

**要点**：
- tsc 按 package.json `exports.types` 找 `./dist/index.d.ts`
- 未 build 则无 dist → TS2307
- pnpm 软链的是包目录，不会自动改用 src
- Vitest 用 alias 指 src，故 test 可过、根 typecheck 不过

**详文**：[../packages/workspace-types-dist-entry.md](../packages/workspace-types-dist-entry.md)
