# Stage 03: 工具调用（含工具安全）

> Agent 的核心不是聊天，是"能调用工具完成任务"。本阶段同时把"工具安全"主题前置过来——zod 校验、`requiresApproval` 审批、按类别白名单——避免后面 stage 复用工具时再补窟窿。

## 学习目标

- 用 zod schema 描述工具参数，自动生成 OpenAI function calling 的 JSON Schema
- 写出"模型请求工具 → 并行执行 → 把结果回灌"的多轮循环，且符合 OpenAI 协议契约
- 区分四类工具失败：not_found / permission_denied / validation / execution
- 用 `requiresApproval` + permissions 上下文实现敏感操作的审批门
- 知道内置工具的安全防线：路径遍历、SSRF、响应大小限制

## 前置知识

- 完成 [Stage 00–02](../stage00-engineering/README.md)
- 了解 OpenAI Chat Completions API 的 `tool_calls` / `role:'tool'` 字段

## 核心概念

### 1. Tool 抽象

```ts
interface ToolDefinition<TParams = any> {
  name: string
  description: string
  parameters: z.ZodType<TParams> // ← 用 zod 而不是手写 JSON Schema
  execute: (params: TParams, ctx?) => Promise<ToolResult>
  category?: string
  requiresApproval?: boolean // ← 审批门
}
```

`ToolRegistry.toLLMFormat()` 会用 `zod-to-json-schema` 自动转出 OpenAI function calling 标准格式。**不需要手动维护两份 schema**。

### 2. ReAct 风格的多轮工具循环

```ts
for (let iter = 0; iter < MAX_ITER; iter++) {
  const response = await client.chat(history, { tools: registry.toLLMFormat() })

  if (!response.toolCalls?.length) {
    history.push({ role: 'assistant', content: response.content })
    break // ← 模型不再请求工具，结束
  }

  // 协议契约 1: assistant 消息必须保留 tool_calls 字段
  history.push({ role: 'assistant', content: response.content, tool_calls: response.toolCalls })

  // 并行执行所有 tool_calls
  const results = await registry.executeBatch(
    response.toolCalls.map(tc => ({ id: tc.id, name: tc.function.name, arguments: JSON.parse(tc.function.arguments) }))
  )

  // 协议契约 2: 每个 tool_call 都必须对应一条 role:'tool' 消息
  for (let i = 0; i < results.length; i++) {
    history.push({ role: 'tool', tool_call_id: response.toolCalls[i].id, content: results[i].content })
  }
}
```

stage04 会把这段循环抽象成 `Agent` 类，但**先把它手写过一遍**，对协议契约的理解会扎实很多。

### 3. 工具安全的三道防线

| 防线 | 实现位置 | 作用 |
|------|---------|------|
| **参数校验** | `tool.parameters: z.ZodType` | 拒绝非法入参；统一返回 `Tool "x" parameter validation failed: ...` |
| **审批门** | `tool.requiresApproval` + `ctx.permissions.includes('approve')` | 默认拒绝；显式授权才放行 |
| **业务级防护** | 工具内部实现 | `read_file` 限定 baseDir + 大小、`http_request` 拒绝私网/loopback、所有 fetch 都有超时和响应上限 |

**典型攻击场景与对应防线**：

- 模型生成 `{ path: "../../etc/passwd" }` → `read_file` 内部 `path.resolve` + `startsWith(baseDir)` 拦截
- 模型生成 `{ url: "http://169.254.169.254/..." }`（云元数据 SSRF） → `http_request` 拒绝私网段
- 模型生成超大 body → 工具内部 `maxBytes` 截断
- 高危工具被未授权调用 → registry 在执行前检查 `requiresApproval`

### 4. 内置工具

| 工具名 | 类别 | 是否需审批 | 关键防护 |
|-------|------|----------|---------|
| `read_file` | filesystem | ✅ | baseDir 限制 + 256 KB 上限 + 路径遍历 |
| `http_request` | network | – | 拒绝私网 / 1 MB 响应上限 / 10s 超时 |
| `get_current_time` | utility | – | 时区参数 zod 校验 |
| `calculator` | utility | – | 表达式黑名单（无 eval） |
| `search_web` | network | – | 仅签出 query，不直连搜索引擎 |

> stage11 会在 `packages/tools` 之上再叠一层"运行时沙箱"（resource limit、网络白名单），本阶段先专注接口和审批语义。

## 产出与目录

```
stage03-tool-calling/
├── src/example.ts          # 多轮工具循环 demo（真实调 LLM）
└── test/example.test.ts    # 教程模式的集成测试（不依赖真实 LLM）
```

## 验收清单

- [ ] 不看代码也能写出"工具循环"的两个协议契约
- [ ] 知道 zod schema → OpenAI function calling JSON Schema 是哪一行做的
- [ ] 能解释 `requiresApproval` 的检查时机（参数校验前 or 后？）
- [ ] 能列出 `read_file` / `http_request` 各至少 2 条业务级防护
- [ ] `pnpm --filter stage03-tool-calling test` 通过

## 快速开始

```bash
# 跑测试（不需要 API Key）
pnpm --filter stage03-tool-calling test

# 跑完整 demo（需要 API Key）
cp stages/stage03-tool-calling/.env.example stages/stage03-tool-calling/.env
pnpm --filter stage03-tool-calling dev
```

## 与下一阶段的衔接

阶段 03 把"调一次 LLM + 执行一次工具"的协议跑通；[Stage 04: Agent Runtime](../stage04-agent-runtime/README.md) 把这段循环抽象成 `Agent` 类，加上迭代上限、abort、onStep 回调，做成可复用的 ReAct loop runtime。
