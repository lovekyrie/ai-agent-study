---
name: learning-qa-journal
description: >-
  Records conceptual Q&A into docs/ for later review after answering the user.
  Use when the user asks what something means (什么意思/是什么/为什么/解释一下),
  asks about tsconfig, TypeScript, project config, architecture, or learning
  questions tied to files in this repo; or when the user mentions 记录/复盘/学习笔记.
---

# Learning Q&A Journal

在本仓库中回答**概念性、解释性**问题后，将问答沉淀到 `docs/`，方便复盘。

## 何时触发

满足任一即执行记录（回答完问题后再写 docs，不要只记录不回答）：

- 用户问「什么意思 / 是什么 / 为什么 / 解释一下 / 有什么区别」
- 问题指向具体文件或配置（`@path`、`tsconfig`、某行代码）
- 用户明确要求「记录」「复盘」「写到 doc」

**不记录**：纯实现任务（修 bug、写功能、跑命令）、闲聊、与仓库无关的泛问。

## 目录规则

```
docs/
├── README.md
├── learning/
│   ├── INDEX.md              # 日期索引（必更新）
│   └── YYYY-MM-DD-{slug}.md  # 当日/session 日志
└── {topic}/                  # 专题详文，如 typescript/
    └── {slug}.md
```

### 路径映射（按问题上下文）

| 上下文 | 专题目录 | slug 示例 |
|--------|----------|-----------|
| tsconfig / TypeScript / ESM import | `docs/typescript/` | `no-emit`, `esm-import-js-extension` |
| packages/config | `docs/packages/config/` | `loader-env` |
| Agent / RAG / MCP 等 stage | `docs/stages/` | `stage04-react-loop` |
| 无法归类 | 仅写 `docs/learning/` 日志 | — |

## 记录流程

1. **先正常回答**用户（中文、清晰）。
2. **确定 slug**：英文 kebab-case，简短描述主题。
3. **更新或新建专题** `docs/{topic}/{slug}.md`：
   - 标题 + 对应源码链接（相对路径到仓库根）
   - 表格或列表概括要点
   - 避免复制整段聊天，写可独立阅读的笔记
4. **追加当日日志** `docs/learning/YYYY-MM-DD-{主主题}.md`：
   - 同一天同主题追加 `## Qn:` 区块，不重复建文件
   - 不同大主题可同日多文件
5. **更新** `docs/learning/INDEX.md` 表格（日期 | 主题 | 文件）
6. **回复末尾**告知用户已写入的路径（一行即可）

## 日志条目模板

```markdown
## Q{n}: {问题一句话}

**上下文**：`path/to/file.ts` 或配置名

**要点**：
- 要点 1
- 要点 2

**详文**：[../topic/slug.md](../topic/slug.md)
```

## 专题文模板

```markdown
# {标题}

> 对应文件：[path](../../path/to/file)

## 含义 / 原因

（正文）

## 在本仓库中的作用

（可选，联系 monorepo 结构）
```

## 原则

- 中文，言简意赅；不跑 lint；不修改 plan 类文件
- 专题文可更新合并，避免同题多文件
- 只写 `docs/`，不要提交 `.env` 或密钥
- 用户只要口头回答、明确说「不要记录」时跳过写 docs

## 示例

用户：`@tsconfig.json noEmit 什么意思`

Agent 动作：

1. 解释 `noEmit: true`
2. 更新 `docs/typescript/no-emit.md`
3. 追加 `docs/learning/2026-05-19-typescript-config.md`
4. 更新 `docs/learning/INDEX.md`
5. 回复末尾：`已记录到 docs/typescript/no-emit.md`
