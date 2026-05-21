# Stage 01: LLM API 基础

> 把"调一次 OpenAI"拆成可观测、可重试、可流式、可切模型的客户端。本阶段的产出沉淀在 `packages/llm-client`。

## 学习目标

- 不依赖 SDK，用 `axios` 直接调 Chat Completions API
- 同时支持非流式 `chat()` / 流式 `stream()` / JSON 结构化 `jsonStructured()`
- 正确处理 SSE 跨 chunk 边界、`[DONE]` 标记
- 区分可重试错误（429 / 5xx）vs 不可重试错误（401 / 400）
- 用统一接口适配 OpenAI 兼容的多家模型

## 前置知识

- 完成 [Stage 00](../stage00-engineering/README.md)
- 看过 OpenAI Chat Completions API 文档

## 核心概念

### 1. 客户端工厂
- `createLLMClient(overrides?)`：env + 用户覆盖合并，缺 API key 时显式抛错
- `createLLMClientFromConfig(llmConfig)`：从已加载的 `getConfig().llm` 注入，避免 `llm-client` 反向依赖 `config`

### 2. 三种调用模式（同一 client 实例）

```ts
const client = createLLMClient()

// 非流式
const r = await client.chat([{ role: 'user', content: 'hi' }])

// 流式（async iterator）
for await (const chunk of client.stream(messages)) {
  if (!chunk.done)
    process.stdout.write(chunk.delta)
}

// 结构化 JSON
const data = await client.jsonStructured<{ name: string }>(messages)
```

### 3. SSE 解析的两个坑
- `data: {...}` 可能跨 chunk 边界 → 必须缓冲到 `\n`
- 一行 JSON 解析失败应"静默跳过"，不要让单条错乱终止整个流

### 4. 重试策略
- 仅对 429 / 5xx / 网络错误重试；401 / 400 立即抛 `LLMError`
- 指数退避（默认上限 3 次），可被 `maxRetries` 覆盖
- `LLMError` 保留 `status` 字段，方便上层做差异化处理

### 5. 参数与 Token 管理
- `temperature / topP / maxTokens` 在 `chat()` 调用粒度上可覆盖工厂默认
- `maxTokens` 优先用 `chat()` 入参里的 `maxTokens`（场景化），工厂级别只是兜底
- Token 估算放到 stage05（Memory & Context Engineering）里讲

### 6. 多模型适配
- 任何 OpenAI 兼容端点（DeepSeek / 通义 / Together / Ollama）只需改 `baseURL` + `model`
- 不在 client 里硬编码 OpenAI 专有字段（如 `seed`、`logprobs`）

## 测试与示例

| 入口 | 用途 |
|------|------|
| `src/example.ts` | 端到端 demo：依次跑非流式 / 流式 / JSON 三种模式 |
| `src/cli/code-explainer.ts` | "代码解释器" CLI，演示如何把 LLM 包装成命令行工具 |
| `test/example.test.ts` | 用 axios mock 重现 stage 教程里讲的三种调用模式 |

包内还有一份更深入的 mock 测试 `@ai-agent-study/llm-client` 的 `test/client.test.ts`（覆盖 SSE 边界、重试、错误映射等 14 个用例）。stage 自己的测试**不重复测客户端内部细节**，只验证教程里展示的"使用模式"。

## 验收清单

- [ ] 看完 `src/example.ts` 能解释三种模式各自的适用场景
- [ ] 不看代码也能说出"为什么 SSE 解析必须按 `\n` 缓冲"
- [ ] `pnpm --filter stage01-llm-api test` 通过
- [ ] 配置好 `.env` 后 `pnpm --filter stage01-llm-api dev` 能跑通三种模式
- [ ] 能把 `OPENAI_API_BASE` 改成本地 Ollama 端点而不动业务代码

## 快速开始

```bash
# 1) 复制环境变量模板
cp stages/stage01-llm-api/.env.example stages/stage01-llm-api/.env
# 编辑 .env 填入 OPENAI_API_KEY

# 2) 跑 demo
pnpm --filter stage01-llm-api dev

# 3) 跑测试（不需要 API Key，全用 mock）
pnpm --filter stage01-llm-api test
```

## 与下一阶段的衔接

阶段 01 解决了"怎么调"，但调的内容（messages 数组）还是手写的。[Stage 02: Prompt + 基础上下文](../stage02-prompt-context/README.md) 把"怎么写 messages"系统化为模板系统、few-shot examples、输入清理。
