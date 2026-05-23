# 2026-05-22 学习笔记：pnpm workspace

## Q1: 根目录 pnpm install 是否会给所有子包装依赖？原理是什么？

**上下文**：`README.md` 安装说明、`pnpm-workspace.yaml`

**要点**：
- 会；workspace 成员由 `pnpm-workspace.yaml` 的 `packages` 字段定义
- 一次 install 汇总所有子包 `package.json`，统一解析并写入根 `pnpm-lock.yaml`
- 物理依赖集中在根 `node_modules/.pnpm`，子包多为 symlink
- 子包间 workspace 依赖走本地链接；新增依赖用 `pnpm --filter <pkg> add`

**详文**：[../packages/pnpm-workspace-install.md](../packages/pnpm-workspace-install.md)
