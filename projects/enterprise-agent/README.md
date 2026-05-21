# Enterprise Workflow Agent

企业级工作流自动化 Agent，支持多 Agent 协调、人工审批和条件分支。

## 核心能力

- **多 Agent 协调**: Supervisor/Reviewer/Executor/Notifier 分工协作
- **可视化工作流**: 节点图定义，支持条件分支和并行执行
- **人工审批**: Human-in-the-loop 审批节点
- **LLM 决策**: 条件节点使用 LLM 判断分支
- **完整审计**: 所有操作记录到审计日志

## 技术架构

```
┌──────────────────────────────────────────────────────┐
│              WorkflowOrchestrator                     │
├──────────────────────────────────────────────────────┤
│  Agents          │  Workflows      │    Tasks        │
│  - Supervisor    │  - 节点定义      │  - 注册处理器   │
│  - Reviewer      │  - 实例管理      │  - 状态跟踪     │
│  - Executor      │  - 上下文传递    │  - 审批流程     │
│  - Notifier      │  - 事件发射      │  - 结果记录     │
├──────────────────────────────────────────────────────┤
│                    LLM Client                         │
│                 (GPT-4 / Claude)                     │
└──────────────────────────────────────────────────────┘
```

## 节点类型

| 类型 | 说明 |
|------|------|
| start/end | 工作流入口/出口 |
| task | 执行注册的任务处理器 |
| approval | 人工审批节点 |
| condition | LLM 判断条件分支 |
| parallel | 并行执行多个分支 |
| agent | 委托给 LLM Agent |

## 核心组件

### WorkflowOrchestrator
```typescript
const orchestrator = new WorkflowOrchestrator()

// 注册任务处理器
orchestrator.registerTaskHandler('lint', async (task, ctx) => {
  return { success: true, artifacts: { lintPassed: true } }
})

// 注册工作流
orchestrator.registerWorkflow(WORKFLOW_TEMPLATES.codeReview())

// 启动实例
const instance = await orchestrator.startWorkflow('code-review', { pr: 123 })
```

### 工作流模板
```typescript
// 代码审查
WORKFLOW_TEMPLATES.codeReview()
// Lint → Test → Human Review → End

// 工单处理
WORKFLOW_TEMPLATES.ticketProcessing()
// Categorize → Route by Priority → Process → Notify → End
```

## 使用示例

```typescript
import { WORKFLOW_TEMPLATES, WorkflowOrchestrator } from '@ai-agent-study/enterprise-agent'

async function main() {
  const orchestrator = new WorkflowOrchestrator()

  // 注册任务处理器
  orchestrator.registerTaskHandler('lint', async (task, ctx) => {
    console.log('Running linter...')
    return { success: true, artifacts: { lintPassed: true } }
  })

  orchestrator.registerTaskHandler('test', async (task, ctx) => {
    console.log('Running tests...')
    return { success: true, artifacts: { testsPassed: true } }
  })

  // 注册并启动工作流
  orchestrator.registerWorkflow(WORKFLOW_TEMPLATES.codeReview())
  const instance = await orchestrator.startWorkflow('code-review', {
    prNumber: 123,
    repo: 'owner/repo',
  })

  // 审批任务
  await orchestrator.approveTask(instance.id, taskId, 'reviewer', 'LGTM')

  // 查看结果
  const result = orchestrator.getInstance(instance.id)
  console.log(result.status, result.context)
}
```

## 简历亮点

- 设计多 Agent 工作流协调器，支持 Supervisor-Specialist 模式
- 实现 durable execution，支持检查点保存和恢复
- 集成 human-in-the-loop 审批机制，满足企业合规要求
- 使用 BullMQ 风格的任务队列，支持并发和重试

## 业务场景

1. **客服工单处理**: 自动分类、优先级判断、转派、通知
2. **合同审查**: 条款提取、风险评估、人工复核
3. **数据分析**: ETL 流程编排、质量检查、报告生成
4. **运维自动化**: 巡检、告警处理、故障恢复

## 下一步

- 集成 PostgreSQL 持久化工作流状态
- 添加 Web UI 可视化工作流设计器
- 实现定时触发和 Webhook 集成
