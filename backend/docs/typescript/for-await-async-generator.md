# for await...of 与 AsyncGenerator（流式 LLM）

> 对应：[apps/api/src/app.ts](../../apps/api/src/app.ts)、[packages/llm-client/src/client.ts](../../packages/llm-client/src/client.ts)

## 语法

```ts
for await (const chunk of getLLMClient().stream(messages, chatOptions)) {
  // 每收到一块 chunk 执行一次
}
```

这是 ES2018 的 **异步迭代**：`for await...of`，用来消费 **AsyncIterable**（异步可迭代对象）。

## 和普通 for...of 的区别

| | `for...of` | `for await...of` |
|---|------------|------------------|
| 数据 | 同步 Iterable（数组等） | AsyncIterable |
| 每次循环 | 立刻取值 | **await** 下一个值 |
| 典型场景 | `for (const x of arr)` | 流式 API、SSE 分块 |

## 为什么能用在 `.stream()` 上

`LLMClient.stream()` 是 **async generator**（`async*`）：

```ts
async* stream(...): AsyncGenerator<StreamChunk> {
  yield* this.doStream(...)
}
```

- `async function*` 返回 `AsyncGenerator`
- 每次 `yield` 吐出一个 `StreamChunk`（含 `delta`、`done`）
- 外层 `for await...of` 会 **逐块 await**，直到迭代结束

## 在本项目里的含义

```ts
for await (const chunk of getLLMClient().stream(...)) {
  if (chunk.done) break
  if (!chunk.delta) continue
  content += chunk.delta
  writeSSE(controller, { type: 'token', delta: chunk.delta, ... })
}
```

LLM 通过 SSE 一块块返回 token → generator 不断 `yield` → 循环里立刻转发给前端，**不用等整段响应结束**。

## 等价写法（理解用）

```ts
const iter = getLLMClient().stream(messages, chatOptions)
while (true) {
  const { value: chunk, done } = await iter.next()
  if (done) break
  // 处理 chunk
}
```

`for await...of` 是上面模式的语法糖。

## 相关

- 生产者：`async*` + `yield` / `yield*`
- 消费者：`for await...of`
- Stage01 CLI 里也有同样用法
