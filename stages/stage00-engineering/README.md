# Stage 00: 工程基础

> 整套学习路径的"地基"。这一阶段不是为了写 AI 代码，而是把后面 11 个阶段所依赖的工程约定一次性立好。

## 学习目标

- 看懂这个仓库的 monorepo 结构与包依赖关系图
- 能在新机器上从零跑通 `pnpm install && pnpm test`
- 理解 `packages/logger`、`packages/config` 为什么独立成包
- 知道每个 stage 的统一目录约定（`src/` + `test/` + `README.md`）

## 前置知识

- 熟悉 Node.js / TypeScript 基本语法
- 用过 `npm` 或 `yarn`，对 `package.json` 的 `dependencies / devDependencies / scripts` 大致了解

## 项目结构（鸟瞰）

```
ai-agent-study/
├── packages/                       # 跨 stage 复用的共享包（"工具箱"）
│   ├── config/                     # 环境变量加载 + 校验
│   ├── logger/                     # pino 封装的结构化日志
│   ├── llm-client/                 # LLM HTTP 客户端
│   ├── prompt/                     # 模板/few-shot/sanitize/truncate
│   ├── tools/                      # ToolRegistry + 内置工具
│   ├── memory/                     # 短期 / 长期记忆
│   ├── vectorstore/                # 向量存储抽象
│   └── mcp/                        # MCP 客户端
├── stages/                         # 12 个学习阶段（按序学习）
│   └── stageNN-XXX/
│       ├── src/                    # 演示代码（< 250 行 / 文件）
│       ├── test/                   # 至少 1 个 happy + 1 个错误路径
│       ├── README.md               # 学习目标 / 前置 / 核心 / 验收 / 衔接
│       ├── package.json
│       └── tsconfig.json
├── projects/                       # 综合项目（基于若干 stage 沉淀）
├── tsconfig.base.json              # 严格模式 + NodeNext + ES2022
├── vitest.config.ts                # 覆盖率 80% 阈值
├── eslint.config.mjs               # ESLint flat config
└── pnpm-workspace.yaml             # workspace 列表
```

## 包依赖图

> 箭头方向 = "依赖"。最上层是 stage / project，最下层是 `config / logger`。

```
                                 ┌──────────────────────────┐
                                 │  stages/* + projects/*   │
                                 └────────────┬─────────────┘
                                              │
       ┌──────────────────────┬───────────────┼────────────────┬──────────────────┐
       ▼                      ▼               ▼                ▼                  ▼
  llm-client              prompt           tools            memory          vectorstore  mcp
       │                      │               │                │                  │
       ▼                      │               ▼                │                  │
   (axios)                    │            (zod,              │                  │
                              │     zod-to-json-schema)        │                  │
                              │                                │                  │
                              └────────────────────────────────┴──────────────────┘
                                              │
                                              ▼
                                     ┌──────────────────┐
                                     │ logger / config  │   ← 所有 stage 都允许直接依赖
                                     └──────────────────┘
```

**关键约定**

- **packages 之间**保持低耦合：`llm-client` / `tools` / `prompt` 等同级包不互相依赖
- **stages 可以依赖 packages**，但 **stages 之间不互相依赖**（stage 是教学单元，不是运行时单元）
- 真正落地到 `packages/` 的代码必须有测试；stage 里的 `src/example.ts` 是"演示"，不上生产路径

## 核心概念

### 1. Monorepo (pnpm workspace)
- `pnpm-workspace.yaml` 列出所有可识别的包
- 跨包引用用 `"@ai-agent-study/<name>": "workspace:*"`
- 单一锁文件 `pnpm-lock.yaml`，统一依赖版本

### 2. TypeScript 严格模式
- `tsconfig.base.json` 开启 `strict: true`、`module: NodeNext`
- 每个包/stage 的 `tsconfig.json` 都 `extends` base，避免重复
- 根目录 `tsconfig.json` 用于 `pnpm typecheck`，不出 dist

### 3. 测试与覆盖率
- Vitest 全局 `globals: true`、`environment: 'node'`
- 覆盖率阈值 80%（lines / functions / branches / statements）
- 测试文件位置约定：`packages/*/test/*.test.ts`、`stages/*/test/*.test.ts`

### 4. 日志（`packages/logger`）
- 基于 `pino` 的薄封装，对外暴露 `Logger` 类 + `LogContext`
- 结构化字段 + 错误对象自动展开 stack
- 所有 stage 都用同一个 logger，避免 `console.log` 散落

### 5. 配置（`packages/config`）
- 环境变量加载 + 类型化
- `getConfig()` 是缓存单例；`loadConfig()` 是无副作用的加载函数（便于测试）
- 缺关键变量时显式报错而不是默默使用 default

## 验收清单

- [ ] `pnpm install` 一次成功
- [ ] `pnpm test` 全绿（当前 195 个）
- [ ] `pnpm typecheck` 全绿
- [ ] `pnpm lint` 通过
- [ ] 能解释"为什么 `packages/logger` 不依赖 `packages/config`"
- [ ] 能画出本仓库的依赖图

## 快速开始

```bash
# 在仓库根目录
pnpm install
pnpm test

# 只跑 stage00 自己的测试
pnpm --filter stage00-engineering test

# 跑 stage00 的演示
pnpm --filter stage00-engineering dev
```

## 与下一阶段的衔接

阶段 00 把"工程地基"夯实之后，[Stage 01: LLM API 基础](../stage01-llm-api/README.md) 会基于本阶段的 `packages/config` + `packages/logger`，开始接入真实的 LLM HTTP API。