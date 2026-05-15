# Stage 1: LLM API 基础

## 目标

掌握模型调用的底层机制，而不是只会复制 SDK 示例。

## 学习内容

### 1. Chat / Responses API
- 输入输出结构
- System / User / Assistant / Tool message
- Message 数组管理

### 2. Streaming 流式输出
- SSE (Server-Sent Events) 处理
- EventSource 使用
- 流式数据解析

### 3. JSON 结构化输出
- JSON mode
- JSON Schema 验证
- Structured output

### 4. Token 管理
- 上下文窗口
- Token 计算
- Token 优化策略

### 5. 参数调优
- Temperature
- Top P
- Max Tokens
- Frequency Penalty
- Presence Penalty

### 6. 错误处理
- Retry 策略
- Timeout 处理
- Rate Limit 处理
- 错误码识别

### 7. 多模型适配
- OpenAI 格式兼容
- 模型切换
- 统一接口

## 产出

- `packages/llm-client/` - 完整的 LLM 客户端
- `stages/stage1-llm-api/` - 示例和测试
- CLI 工具
- 单元测试 + 集成测试

## API 示例

### 非流式调用

```typescript
import { createLLMClient } from '@ai-agent-study/llm-client'

const client = createLLMClient()

const response = await client.chat([
  { role: 'system', content: '你是一个有帮助的助手。' },
  { role: 'user', content: '你好！' }
])

console.log(response)
```

### 流式调用

```typescript
import { createLLMClient } from '@ai-agent-study/llm-client'

const client = createLLMClient()

const emitter = client.streamChat([
  { role: 'user', content: '写一首关于春天的诗' }
])

emitter.on('chunk', (chunk) => {
  process.stdout.write(chunk)
})

emitter.on('done', () => {
  console.log('\n完成')
})
```

### JSON 结构化输出

```typescript
import { createLLMClient } from '@ai-agent-study/llm-client'

const client = createLLMClient()

const response = await client.chat(
  [{ role: 'user', content: '提取这段文本中的实体：...' }],
  { jsonMode: true }
)

const data = JSON.parse(response)
```

## 验收标准

- [ ] 实现完整的 LLM 客户端
- [ ] 支持非流式和流式调用
- [ ] 支持结构化 JSON 输出
- [ ] 支持多模型切换
- [ ] 有完善的错误处理
- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试通过

## 下一步

完成阶段 1 后，进入 [阶段 2: Prompt + 上下文](../stage2-prompt-context/README.md)