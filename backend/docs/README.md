# 学习笔记

本目录存放 backend 相关的概念问答与复盘材料。

## 目录结构

| 路径 | 说明 |
| --- | --- |
| [learning/](./learning/) | 按**日历日**一条日志（`YYYY-MM-DD.md`），当日多题写在同一文件 |
| [learning/INDEX.md](./learning/INDEX.md) | 日志日期索引 + 专题笔记索引 |
| [typescript/](./typescript/) | TypeScript / tsconfig 持久笔记 |
| [packages/](./packages/) | 各 workspace 包相关持久笔记 |

## 约定

- **日志**：`learning/2026-05-28.md` 这类文件名只表示日期，不再按主题拆成 `2026-05-28-xxx.md`。
- **专题**：可反复查阅的解释放在 `typescript/` 或 `packages/<pkg>/`，日志里用「详文」链接过去。
- **其他**：如 [agent-backend-extension-plan.md](./agent-backend-extension-plan.md) 为规划文档，不属于问答日志。

## 如何新增

在 Cursor 中提问时启用 [learning-qa-journal](../../.cursor/skills/learning-qa-journal/SKILL.md)（或项目根 `.claude/skills` 中的同名 skill），Agent 会追加到当日 `learning/YYYY-MM-DD.md` 并更新 `INDEX.md`。

也可手动在 `learning/` 或专题目录下补充 markdown。
