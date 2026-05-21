# Stage 10 — 评估体系（系统化）

> **目标**：建立 Agent 系统的完整评估闭环——Golden Dataset 管理、规则/LLM 双评估、工具调用精度、回归检测与成本追踪。

---

## 核心概念

| 组件 | 职责 |
|------|------|
| **GoldenDataset** | 管理测试用例（按 category 分组：rag / tool_calling / agent / general） |
| **RuleBasedEvaluator** | 基于关键词、正则、自定义函数的确定性评估 |
| **LLMJudge** | LLM-as-judge 打分 + RAG 四维指标 |
| **ToolCallingEvaluator** | 工具调用 Precision / Recall / F1 |
| **EvalRunner** | 编排执行 + 生成 EvalSuite 报告 |
| **RegressionTracker** | 对比基线/当前，检测 passRate / latency 回归 |
| **CostTracker** | 按 model 维度统计 token 消耗与费用 |

---

## 目录结构

```
src/
├── types.ts       # EvalCase / EvalOutput / EvalResult / EvalSuite 等接口
├── dataset.ts     # GoldenDataset — 用例 CRUD + 按类目筛选
├── evaluators.ts  # RuleBasedEvaluator / LLMJudge / ToolCallingEvaluator / clampScore
├── runner.ts      # EvalRunner — 串联评估流程
├── trackers.ts    # RegressionTracker / CostTracker
├── index.ts       # barrel re-export
└── example.ts     # 完整演示
test/
└── evals.test.ts  # 22 tests — 覆盖全部评估器 + dataset + runner + trackers
```

---

## 快速上手

### 1. 构建 Golden Dataset

```typescript
import { GoldenDataset } from './dataset.js'

const dataset = new GoldenDataset()
dataset.add({
  id: 'rag-001',
  name: 'TS 知识问答',
  category: 'rag',
  input: { query: 'What is TypeScript?' },
  expected: { contains: ['TypeScript', 'JavaScript'] },
})
```

### 2. 运行评估

```typescript
import { EvalRunner } from './runner.js'

const runner = new EvalRunner(dataset)
const suite = await runner.runAll({
  runFn: async (testCase) => {
    const answer = await myAgent.run(testCase.input.query!)
    return { content: answer }
  },
})

console.log(suite.summary.passRate)       // 0.85
console.log(suite.summary.categoryBreakdown)
```

### 3. LLM Judge（RAG 四维指标）

```typescript
import { LLMJudge } from './evaluators.js'

const judge = new LLMJudge()
const metrics = await judge.judgeRAG(question, answer, contexts)
// { faithfulness, answerRelevance, contextPrecision, contextRecall }
```

### 4. 工具调用评估

```typescript
import { ToolCallingEvaluator } from './evaluators.js'

const evaluator = new ToolCallingEvaluator()
const result = evaluator.evaluate(
  [{ tool: 'file_read', params: {}, success: true }],
  ['file_read', 'search'],
)
// { precision: 1, recall: 0.5, f1: 0.67, missedTools: ['search'] }
```

### 5. 回归检测

```typescript
import { RegressionTracker } from './trackers.js'

const tracker = new RegressionTracker()
tracker.add(baselineSuite)
tracker.add(currentSuite)
const report = tracker.compare(baselineSuite, currentSuite)
if (report.hasRegression) console.warn(report.regressions)
```

### 6. 成本追踪

```typescript
import { CostTracker } from './trackers.js'

const cost = new CostTracker()
cost.record(1500, 800, 'gpt-4o')
console.log(cost.getTotal().estimatedCost)
console.log(cost.getByModel())
```

---

## 评估指标一览

| 指标 | 适用场景 |
|------|----------|
| Pass Rate | 全局通过率 |
| Precision / Recall / F1 | 工具调用正确性 |
| Faithfulness | RAG 答案是否忠于上下文 |
| Answer Relevance | RAG 答案是否回答了问题 |
| Context Precision | 检索到的上下文是否精准 |
| Context Recall | 需要的上下文是否都被检索到 |

---

## 与 Stage 06 的关系

- **Stage 06** `retrieval-eval`：评估检索质量（Hit Rate / Precision@k / MRR）
- **Stage 10**：评估端到端答案质量 + 工具行为 + 成本

两者可组合使用：先用 stage06 确保检索准确，再用 stage10 确保最终输出达标。

---

## 运行

```bash
pnpm --filter stage10-evals dev      # 运行 example
pnpm --filter stage10-evals test     # 22 tests
```

## 验收标准

- [ ] GoldenDataset 支持按 category 筛选
- [ ] RuleBasedEvaluator 支持 contains / pattern / custom / minScore
- [ ] ToolCallingEvaluator 计算 Precision / Recall / F1
- [ ] EvalRunner 串联执行并生成 EvalSuite 报告
- [ ] RegressionTracker 检测 passRate 和 latency 回归
- [ ] CostTracker 按 model 汇总 token 和费用
- [ ] 所有 22 个测试通过