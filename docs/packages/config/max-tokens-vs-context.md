# maxTokens 与 MiniMax-M2.7 上下文窗口

> 对应文件：[packages/config/src/schemas.ts](../../packages/config/src/schemas.ts)

## MiniMax-M2.7 官方上限

| 概念 | 值 | 说明 |
|------|-----|------|
| Context Window | **204,800 tokens** | 输入 + 输出合计上限 |
| API 参数 `max_tokens` | 单次**输出**预算 | 不是整窗大小 |

官方文档：[MiniMax OpenAI 兼容 API](https://platform.minimax.io/docs/api-reference/text-openai-api)

## 本仓库 `LLMConfigSchema.maxTokens`

```ts
maxTokens: z.number().int().min(1).max(200_000).default(1000)
```

- 映射到请求里的 `max_tokens`（最大生成 token 数）
- `.max(200_000)` 是配置层 sanity check，略低于模型 204,800 总窗
- 实际可用输出 ≈ `204,800 - 当前输入 token 数`

## 配置建议

| 场景 | 建议 |
|------|------|
| 普通对话 | 1000–4096（默认 1000 即可） |
| 长文生成 | 8000–16000，并控制输入长度 |
| 接近上限 | 确保 `输入 + maxTokens ≤ 204800` |
