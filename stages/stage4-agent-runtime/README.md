# Stage 4: Agent Runtime

## 目标

从"单轮工具调用"升级到"多步任务执行"，实现完整的 ReAct Loop。

## 学习内容

### 1. ReAct 思路
- **Re**asoning: 思考下一步该做什么
- **Act**ion: 执行工具调用
- **Obs**ervation: 观察结果

### 2. Plan-Act-Observe 循环
```
用户任务
  -> LLM 判断 (thought)
    -> 执行工具 (action)
      -> 观察结果 (observation)
        -> 继续判断或结束
```

### 3. 最大迭代控制
- 防止无限循环
- 迭代计数器
- 自然结束条件

### 4. 任务分解
- 将复杂任务拆分为子任务
- 顺序/并行执行

### 5. 记忆集成
- 短期记忆 (ShortTermMemory)
- 跨步骤上下文保持

### 6. 人工确认 (Human-in-the-loop)
- 高风险操作确认
- 暂停等待用户输入

## 核心组件

### Agent 类
```typescript
const agent = new Agent({ maxIterations: 10, verbose: true })
agent.registerTool(customTool)

const response = await agent.run('帮我完成XXX')
console.log(response.message)     // 最终答案
console.log(response.steps)      // 执行步骤
```

### ExecutionTrace
```typescript
const trace = agent.getExecutionTrace('task')
console.log(trace.iterations)   // 迭代次数
console.log(trace.success)       // 是否成功
console.log(trace.steps)        // 每一步详情
```

## 快速开始

```bash
cd stages/stage4-agent-runtime
pnpm install
pnpm dev
```

## 下一步

完成阶段 4 后，进入 [阶段 5: 高级 RAG](../stage5-advanced-rag/README.md)