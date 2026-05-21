# Stage 02: Prompt Engineering + 基础上下文

> 把"靠手感写 prompt"升级为可重用、可测试的模板系统。本阶段的产出全部沉淀在 `packages/prompt`，stage 自己只负责演示和练习。

## 学习目标

- 用 `{{变量}}` 模板写出可单测的 prompt，不再字符串拼接
- 区分 `system` / `user` / few-shot examples 三类消息的职责
- 在 stage 级别写出"输入清理 + 注入检测"的最小可用版本
- 用字符级"滑窗裁剪"把超长对话压到一个安全长度（token 级别在 stage05 讲）

## 前置知识

- 完成 [Stage 00](../stage00-engineering/README.md)、[Stage 01](../stage01-llm-api/README.md)
- 看过 OpenAI 的 messages 数组格式

## 核心概念

### 1. 模板渲染（`render`）
- 占位符语法 `{{name}}` / `{{ name }}` / 中文变量名都支持
- `onMissing`：`'keep'`（默认） / `'empty'` / `'throw'`，生产环境推荐 `'throw'`
- 数组自动按 `, ` 拼接，避免每次手写 `tags.join(', ')`

### 2. `buildMessages`：把模板拼成消息数组

```ts
buildMessages(
  {
    system: '你是 {{role}}',
    user: '请处理：{{text}}',
    examples: [{ input: 'Hi', output: '你好' }],
  },
  { role: '翻译', text: 'Hello' }
)
// → [system, user(example.input), assistant(example.output), user(real)]
```

**关键设计**：few-shot examples 是**静态演示**，不参与变量插值，避免一不小心被用户变量污染。

### 3. 预置模板（5 个）

| 模板 | 场景 |
|------|------|
| `CodeExplainTemplate` | 代码解释 |
| `EntityExtractTemplate` | 实体抽取（强制 JSON 输出） |
| `SummaryTemplate` | 文本摘要 |
| `CodeReviewTemplate` | 代码审查（带 few-shot） |
| `RAGQueryOptimizerTemplate` | RAG 查询重写（用于 stage06+） |

每个模板都用 stage 同名测试 + `pnpm dev` 演示一遍。

### 4. 输入清理 / 注入意识（`sanitizeUserInput`）

- 移除控制字符（含零宽字符 `\u200B–\u200F`，prompt injection 常见载体）
- 检测两类信号：
  - 角色前缀：`system:` / `assistant:` / `用户：`
  - 越狱短语：`ignore previous instructions` / `忽略上面的指令` 等
- `throwOnSuspicious=true` 时直接抛错；默认只返回 `warnings` 让上层决定

> **范围声明**：这只是"基础注入意识"。完整的注入防护（工具维度 / 上下文维度）放在 stage03 和 stage11。

### 5. 上下文裁剪（`truncateMessages`）

最朴素但可用：保留首条 system + 最近 N 条用户/助手消息，超过 `maxChars` 从中间截掉。

> 这个函数**不感知 token 数**，纯字符长度兜底。token 级裁剪 + LLM 摘要压缩是 stage05 的内容。

## 产出与目录

```
stage02-prompt-context/
├── src/example.ts          # 7 段 demo: 渲染 / few-shot / 抽取 / 摘要 / 查询优化 / 清理 / 裁剪
└── test/example.test.ts    # 教程模式的集成测试（不重复 packages/prompt 的内部测试）
```

包级单测在 `packages/prompt/test/prompt.test.ts`（32 个 case，覆盖渲染边界、注入检测、裁剪算法等）。

## 验收清单

- [ ] 看完 `src/example.ts` 能解释 7 段 demo 各自演示什么
- [ ] 知道 `render` 的三种 `onMissing` 行为及各自的适用场景
- [ ] 能口述 `sanitizeUserInput` 检测到的两类风险信号
- [ ] `pnpm --filter stage02-prompt-context test` 通过
- [ ] 配好 `.env` 后 `pnpm --filter stage02-prompt-context dev` 能跑完所有 demo

## 快速开始

```bash
# 1) 复制环境变量
cp stages/stage02-prompt-context/.env.example stages/stage02-prompt-context/.env

# 2) 跑测试（不需要 API Key）
pnpm --filter stage02-prompt-context test

# 3) 跑完整 demo（需要 API Key，会真实调用 LLM）
pnpm --filter stage02-prompt-context dev
```

## 与下一阶段的衔接

阶段 02 让 messages 数组生成稳定且可测；[Stage 03: 工具调用](../stage03-tool-calling/README.md) 在此基础上引入"工具"——LLM 可以请求执行具体动作，stage 还会把工具安全（白名单 / 审批 / zod 校验）一起讲清楚。
