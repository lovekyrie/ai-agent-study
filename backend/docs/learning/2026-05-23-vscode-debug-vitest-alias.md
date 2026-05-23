# 2026-05-23 学习笔记：调试 tasks 与 vitest alias

## Q1: tasks.json 干什么？vitest 调试为什么也走 dist？alias 没生效？

**上下文**：`.vscode/tasks.json`、`.vscode/launch.json`、`vitest.config.ts`

**要点**：
- tasks.json = 预构建任务；仅 `preLaunchTask` 绑定的 launch 会在调试前 build
- **vitest 调试项没有 preLaunchTask**，不会默认先跑 tasks
- loader.test 引 config 用相对路径 → src；loader 引 workspace 用包名 → 可能 dist
- 子包 cwd 启动 vitest 时根 vitest.config alias 可能未加载
- 解决：vitest launch 加 `--config ${workspaceFolder}/vitest.config.ts`

**详文**：[../packages/config/vscode-debug-tasks-vitest-alias.md](../packages/config/vscode-debug-tasks-vitest-alias.md)
