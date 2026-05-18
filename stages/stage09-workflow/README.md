# Stage 8: Multi-Agent Workflow

多 Agent 工作流引擎，支持 Supervisor + Specialist 模式的工作流编排。

## 核心功能

- **WorkflowEngine**: 工作流执行引擎，管理节点和边的执行
- **Supervisor Agent**: 负责任务分解和委派
- **Specialist Agent**: 执行特定领域的任务
- **Handoff 机制**: Agent 之间传递控制权
- **Checkpoint**: 工作流状态快照和恢复
- **人工审批**: 审批节点支持人工介入

## 目录结构

```
src/
├── index.ts  # WorkflowEngine, SupervisorAgent, SpecialistAgent, WorkflowBuilder
```

## 核心概念

### Workflow Graph
```
Supervisor ──→ Specialist1 ──→ Supervisor
     ↑                              │
     └──←── Specialist2 ←──────────┘
              ↓
           Approval ──→ End
```

### 工作流状态
- `pending`: 等待开始
- `running`: 执行中
- `waiting_approval`: 等待人工审批
- `completed`: 已完成
- `failed`: 失败
- `cancelled`: 已取消

## 使用示例

### 构建工作流
```typescript
const workflow = new WorkflowBuilder()
  .addSupervisor('supervisor', 'Supervisor', 'Role', 'Instructions')
  .addSpecialist('worker', 'Worker', 'Role', 'Instructions')
  .addApproval('approval', 'Approval', 'Description')
  .addEnd('end', 'Complete')
  .addEdge('supervisor', 'worker')
  .addEdge('worker', 'supervisor')
  .addEdge('supervisor', 'approval')
  .addEdge('approval', 'end')
  .build()
```

### 执行工作流
```typescript
const result = await workflow.execute('workflow-id', { initialData: 'value' })
console.log(result.state)
console.log(result.history)
```

### 代码审查工作流
```typescript
const workflow = createCodeReviewWorkflow()
const result = await workflow.execute('pr-review-1', {
  prTitle: 'Add login feature',
  files: ['src/auth/login.ts'],
})
```

### Checkpoint 和恢复
```typescript
const checkpoint = workflow.createCheckpoint(context, nodeId)
await workflow.restoreFromCheckpoint(context, nodeId)
```

### 人工审批
```typescript
if (result.state === 'waiting_approval') {
  await workflow.approve(result)
}
```

## 与 Agent 集成

Supervisor Agent 使用 LLM 做决策：
```typescript
const decision = await supervisorAgent.execute(context)
// decision.handoff contains the next specialist to delegate to
```

Specialist Agent 执行具体任务后可以 handoff 回 Supervisor：
```typescript
// In specialist response:
"handoff:supervisor" // Returns control to supervisor
```

## 设计模式

### Supervisor-Specialist 模式
- Supervisor 做高层决策，决定委派给哪个 Specialist
- Specialist 执行具体任务，完成后返回结果
- 支持条件边，根据执行结果决定下一步

### Checkpoint 模式
- 在关键节点保存状态快照
- 失败时可从 checkpoint 恢复
- 支持长时运行任务的断点执行

### Durable Execution
- 工作流状态持久化（需要外部存储）
- 进程重启后可恢复执行
- 关键决策点记录完整历史