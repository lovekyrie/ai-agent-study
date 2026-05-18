# Stage 9: Agent Evaluation System

Agent 评估体系，支持 Golden Dataset、规则评估、LLM-as-Judge 和回归测试。

## 核心功能

- **GoldenDataset**: 测试用例管理
- **RuleBasedEvaluator**: 规则匹配评估
- **LLMJudge**: LLM 作为裁判的评估
- **ToolCallingEvaluator**: 工具调用评估（Precision/Recall/F1）
- **EvalRunner**: 测试运行器
- **RegressionTracker**: 回归检测
- **CostTracker**: 成本追踪

## 目录结构

```
src/
├── index.ts  # 所有评估组件
```

## 核心概念

### Golden Dataset
预定义的测试用例集：
```typescript
{
  id: 'rag-001',
  name: 'Basic RAG Query',
  category: 'rag',
  input: { query: 'What is TypeScript?' },
  expected: { contains: ['TypeScript', 'JavaScript'] }
}
```

### 评估类型

1. **Rule-Based**: 关键词匹配、模式匹配、分数阈值
2. **LLM-as-Judge**: 使用 LLM 评估答案质量
3. **RAG Metrics**: Faithfulness, Answer Relevance, Context Precision/Recall
4. **Tool Calling**: Precision, Recall, F1

### 回归检测
比较基线和当前评估结果，检测：
- Pass rate 下降
- Latency 增加
- Cost 变化

## 使用示例

### 创建测试用例
```typescript
const dataset = new GoldenDataset()
dataset.add({
  id: 'test-001',
  name: 'Simple Test',
  category: 'general',
  input: { query: 'Say hello' },
  expected: { contains: ['hello'] }
})
```

### 运行评估
```typescript
const runner = new EvalRunner(dataset)
const suite = await runner.runAll({
  runFn: async (testCase) => {
    return { content: 'Hello!', metadata: {} }
  }
})
console.log(suite.summary.passRate)
```

### LLM Judge
```typescript
const judge = new LLMJudge()
const result = await judge.judgeRAG(question, answer, contexts)
console.log(result.faithfulness)
```

### 回归检测
```typescript
const tracker = new RegressionTracker()
tracker.add(baselineSuite)
tracker.add(currentSuite)
const report = tracker.compare(baseline, current)
```

### 成本追踪
```typescript
const tracker = new CostTracker()
tracker.record(inputTokens, outputTokens, 'gpt-4o')
const total = tracker.getTotal()
console.log(total.estimatedCost)
```

## 评估指标

| 指标 | 说明 |
|------|------|
| Pass Rate | 通过率 |
| Precision | 精确率（工具调用） |
| Recall | 召回率（工具调用） |
| F1 | F1 分数 |
| Faithfulness | RAG 答案忠实度 |
| Answer Relevance | RAG 答案相关性 |
| Context Precision | RAG 上下文精确度 |
| Context Recall | RAG 上下文召回率 |