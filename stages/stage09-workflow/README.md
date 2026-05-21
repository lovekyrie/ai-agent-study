# Stage 09 — Multi-Agent Workflow

> **目标**：构建 Supervisor + Specialist 多 Agent 工作流引擎，掌握图状执行、Handoff 机制、Checkpoint 恢复与人工审批。

---

## 核心概念

```
Supervisor ──→ Specialist A ──→ Supervisor ──→ Approval ──→ End
     ↑                                │
     └──────── Specialist B ←─────────┘
```

| 节点类型 | 作用 |
|----------|------|
| **supervisor** | LLM 驱动的"决策者"，通过 handoff 指令分派任务 |
| **specialist** | 执行特定领域任务，完成后 handoff 回 supervisor |
| **approval** | 暂停工作流，等待人工审批 |
| **end** | 终止节点，标记工作流完成 |

### 工作流状态机

`pending` → `running` → `waiting_approval` → `running` → `completed` / `failed` / `cancelled`

---

## 目录结构

```
src/
├── types.ts       # WorkflowState / Node / Edge / Context / Checkpoint 等接口
├── agents.ts      # SupervisorAgent / SpecialistAgent（LLM 驱动）
├── engine.ts      # WorkflowEngine — 图遍历 + 条件边 + checkpoint
├── builder.ts     # WorkflowBuilder (fluent API) + createCodeReviewWorkflow 工厂
├── index.ts       # barrel re-export
└── example.ts     # 完整示例
test/
├── engine.test.ts # 10 tests — 节点遍历 / 审批 / checkpoint / 异常
└── agents.test.ts #  6 tests — handoff 解析 / LLM 错误降级
```

---

## 快速上手

### 1. 使用 Builder 构建工作流

```typescript
import { WorkflowBuilder } from './builder.js'

const engine = new WorkflowBuilder()
  .addSupervisor('sup', 'Supervisor', 'Manager', 'Delegate to specialists')
  .addSpecialist('security', 'Security', 'Security Expert', 'Review for vulns')
  .addApproval('approve', 'Manager Approval', 'Human review required')
  .addEnd('end', 'Done')
  .addEdge('sup', 'security', ctx => !ctx.data.securityDone)
  .addEdge('security', 'sup')
  .addEdge('sup', 'approve', ctx => ctx.data.securityDone === true)
  .addEdge('approve', 'end')
  .build()
```

### 2. 执行工作流

```typescript
const result = await engine.execute('wf-001', { prTitle: 'feat: add login' })
console.log(result.state) // 'waiting_approval' | 'completed' | 'failed'
console.log(result.history) // 每步 nodeId + action + timestamp
```

### 3. 人工审批

```typescript
if (result.state === 'waiting_approval') {
  const final = await engine.approve(result)
  // final.state === 'completed'
}
```

### 4. Checkpoint 与恢复

```typescript
engine.createCheckpoint(context, 'security')
// … 后续失败时
await engine.restoreFromCheckpoint(context, 'security')
```

> **存储说明**：Checkpoint 保存在 `WorkflowContext.checkpoints`（内存 `Map`），进程结束即丢失。生产持久化见 stage11 README。

---

## Handoff 机制

Supervisor LLM 响应中包含 `handoff: <nodeId>` 时，Engine 将控制权交给对应节点：

```
LLM output: "handoff: security\nreason: code touches auth module"
→ engine routes to node 'security'
```

Specialist 完成后返回 `handoff:supervisor`，流程回到 Supervisor 做下一轮决策。

---

## 预置工作流

```typescript
import { createCodeReviewWorkflow } from './builder.js'

const workflow = createCodeReviewWorkflow()
// supervisor → security → performance → style → approval → end
```

---

## 运行

```bash
pnpm --filter stage09-workflow dev      # 运行 example
pnpm --filter stage09-workflow test     # 16 tests
```

## 验收标准

- [ ] WorkflowEngine 支持图遍历 + 条件边 + 最大迭代保护
- [ ] Supervisor/Specialist Agent 解析 handoff 指令并路由
- [ ] 审批节点暂停/恢复工作流
- [ ] Checkpoint 创建和恢复正确快照数据
- [ ] LLM 异常时 Agent 优雅降级（success=false）
- [ ] 所有 16 个测试通过
