# Stage 04: Agent Runtime — ReAct Loop

> 把 stage03 手写的"工具循环"抽象成可复用的 `Agent` 类。stage06+ 的 Agentic RAG、stage09 的 workflow 都会复用本阶段的 Agent，**不要再重新造**。

## 学习目标

- 用一个 `Agent` 类封装 ReAct 循环：Reasoning → Action → Observation
- 在迭代中正确处理：协议契约、`maxIterations` 上限、`AbortSignal` 取消、`onStep` 观测回调
- 每次 `run()` 都返回独立的 `ExecutionTrace`（不共享状态）
- 让 Agent 优雅处理异常分支：模型生成非法 JSON 参数、工具 reject、用户中途 abort

## 前置知识

- 完成 [Stage 03](../stage03-tool-calling/README.md)（手写过工具循环）

## 核心概念

### 1. ReAct 思路

```
用户任务
  → LLM 思考 (Reasoning)
    → 模型决定调用工具 (Action)
      → 并行执行工具 → 写回 role:'tool' 消息 (Observation)
        → 模型基于结果继续思考
          → 直到给出最终答案 (finishReason: 'stop')
```

### 2. `Agent` 的对外契约

```ts
const agent = new Agent({
  llmClient,                  // 可选；不传时惰性 createLLMClient()
  tools: [...],
  permissions: ['approve'],   // 透传给 ToolRegistry
  maxIterations: 10,
  signal: controller.signal,  // 支持取消
  onStep: (step) => trace.push(step),
})

const response = await agent.run('任务描述')
// response: { status, message, trace }
// trace: { task, steps, iterations, status, finalMessage }
```

### 3. 关键设计取舍

- **无状态实例**：单个 `Agent` 可被多次 `run()`，不在实例上保留 trace（避免 task 错配）
- **惰性 LLM 客户端**：`new Agent()` 不读 env，只有真正 `run()` 时才创建客户端，方便测试
- **协议契约由 Agent 内部维护**：assistant 携带 `tool_calls` + 每个 call 配 `role:'tool'`，调用方不用关心
- **错误聚合而不是 throw**：工具校验失败 / 执行失败都落到 `step.toolResults[].error`，模型可以"看到"错误并继续推理

### 4. `ExecutionTrace`：可观测的执行轨迹

```ts
{
  task: '用户原始任务',
  steps: [
    { stepNumber: 1, thought, toolCalls: [], toolResults: [...], finishReason: 'tool_calls' },
    ...
  ],
  iterations: 3,
  status: 'done' | 'max_iterations' | 'error',
  finalMessage: '最终答案'
}
```

trace 是 stage10 评估体系的输入，stage11 OpenTelemetry 也会从这里取 span。

## 测试覆盖

stage 自带 10 个测试覆盖：

| 测试场景 | 覆盖什么 |
|---------|---------|
| 模型不请求工具 → 立即结束 | 最简单 happy path |
| 并行 2 个 tool_calls | 协议契约 1+2 / `executeBatch` |
| 多轮循环（不会"看到 1 个工具结果就终止"） | LLM 决定继续与否 |
| 模型生成非法 JSON 参数 | `safeParseJson` 容错 |
| `maxIterations` 触顶 | 防御性兜底 |
| `onStep` 回调按顺序触发 | 观测能力 |
| `requiresApproval` 工具被默认权限拒绝 | 与 stage03 安全门联动 |
| `AbortSignal.abort()` | 取消语义 |
| 多次 `run()` 的 trace 互相独立 | 实例无状态 |
| **多工具混合编排（集成）** | 端到端：calculator → search → 总结 |

## 验收清单

- [ ] 不看代码也能口述 ReAct 循环每一步发生了什么
- [ ] 能解释"为什么 Agent 实例不持有 trace"
- [ ] 知道 `onStep` 在工具执行**之后**触发（包含 toolResults）
- [ ] 知道 `signal: aborted` 时 status 变成什么
- [ ] `pnpm --filter stage04-agent-runtime test` 通过

## 快速开始

```bash
# 跑测试（不需要 API Key）
pnpm --filter stage04-agent-runtime test

# 跑完整 demo（需要 API Key + 真实工具）
cp stages/stage04-agent-runtime/.env.example stages/stage04-agent-runtime/.env
pnpm --filter stage04-agent-runtime dev
```

## 与下一阶段的衔接

阶段 04 解决了"会跑"。但当任务跨越多个步骤时，Agent 需要"记得住"中间结果——这就是 [Stage 05: Memory & Context Engineering](../stage05-memory-context/README.md) 的领域：短期 / 长期记忆、token 预算、上下文压缩。
