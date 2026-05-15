import { getConfig } from '@ai-agent-study/config'
import { createLLMClient, type ChatMessage } from '@ai-agent-study/llm-client'
import { Logger } from '@ai-agent-study/logger'
import { ToolRegistry, builtinTools, type ToolCallRequest } from '@ai-agent-study/tools'

const MAX_TOOL_ITERATIONS = 5

async function main() {
  const config = getConfig()
  const logger = new Logger({ name: 'stage3-example', level: config.app.logLevel })
  const client = createLLMClient()

  // 1) 创建注册中心，授予 approve 权限（演示用；生产应该由人工审批触发）
  const registry = new ToolRegistry({ permissions: ['approve'] })
  registry.registerAll(builtinTools)

  logger.info('Stage 3: Tool Calling', {
    tools: registry.list().map((t) => t.name),
    categories: registry.listCategories(),
  })

  const llmTools = registry.toLLMFormat()
  console.log('\nLLM Tools schema preview:')
  console.log(JSON.stringify(llmTools[0], null, 2))

  const history: ChatMessage[] = [
    {
      role: 'system',
      content: '你是一个有帮助的助手。需要时调用工具完成任务。',
    },
  ]

  const questions = [
    '现在几点了？请用 get_current_time 工具获取，时区使用 Asia/Shanghai。',
    '请计算 (123 + 456) * 2 / 3 的结果。',
    '请读取项目根目录下的 README.md 文件的前几行，看看是什么项目。',
  ]

  for (const question of questions) {
    logger.info(`\n>>> User: ${question}`)
    history.push({ role: 'user', content: question })

    // 多轮工具循环：直到模型不再请求工具，或达到上限
    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      const response = await client.chat(history, { tools: llmTools })

      if (!response.toolCalls || response.toolCalls.length === 0) {
        console.log(`\nAssistant: ${response.content}`)
        history.push({ role: 'assistant', content: response.content })
        break
      }

      // 模型请求了工具：先把 assistant 消息（含 tool_calls）入历史
      // OpenAI 协议：assistant 消息必须包含 tool_calls 数组以便关联结果
      history.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.toolCalls,
      })

      // 并行执行所有工具调用
      const requests: ToolCallRequest[] = response.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || '{}'),
      }))

      logger.info('Executing tools', {
        calls: requests.map((r) => ({ id: r.id, name: r.name, args: r.arguments })),
      })

      const results = await registry.executeBatch(requests)

      // 把每个工具结果以 role:'tool' + tool_call_id 回传
      for (let i = 0; i < results.length; i++) {
        const req = requests[i]
        const res = results[i]
        const content = res.error ? `ERROR: ${res.error}` : res.content
        history.push({
          role: 'tool',
          content,
          tool_call_id: req.id ?? '',
        })
        console.log(`  [tool ${req.name}] ${content.slice(0, 200)}${content.length > 200 ? '...' : ''}`)
      }

      if (iter === MAX_TOOL_ITERATIONS - 1) {
        logger.warn(`Reached max tool iterations (${MAX_TOOL_ITERATIONS}) without final answer`)
      }
    }
  }

  logger.info('Stage 3 completed')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
