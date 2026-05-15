import { getConfig } from '@ai-agent-study/config'
import { createLLMClient } from '@ai-agent-study/llm-client'
import { Logger } from '@ai-agent-study/logger'

async function main() {
  const config = getConfig()
  const logger = new Logger({ name: 'stage1-example', level: config.app.logLevel })
  const client = createLLMClient()

  logger.info('Stage 1 LLM API Example', {
    model: config.llm.model,
    baseURL: config.llm.baseURL,
  })

  // 1. 非流式调用
  logger.info('--- Non-streaming call ---')
  try {
    const response = await client.chat([
      { role: 'system', content: '你是一个有帮助的助手。用中文回答。' },
      { role: 'user', content: '用一句话介绍 TypeScript。' },
    ])
    console.log('Response:', response.content)
  } catch (error) {
    logger.error('Non-streaming call failed', error instanceof Error ? error : undefined)
  }

  // 2. 流式调用
  logger.info('--- Streaming call ---')
  try {
    for await (const chunk of client.stream([
      { role: 'user', content: '写一首五言绝句，关于编程。' },
    ])) {
      if (!chunk.done) process.stdout.write(chunk.delta)
    }
    console.log('\nStream completed')
  } catch (error) {
    logger.error('Streaming call failed', error instanceof Error ? error : undefined)
  }

  // 3. JSON 结构化输出
  logger.info('--- JSON structured output ---')
  try {
    const result = await client.jsonStructured<{
      name: string
      features: string[]
    }>([
      {
        role: 'system',
        content: 'You are a helpful assistant. Respond only with valid JSON.',
      },
      {
        role: 'user',
        content: '用 JSON 格式返回 TypeScript 的关键特性，包含 name 和 features 字段。',
      },
    ])
    console.log('Structured result:', JSON.stringify(result, null, 2))
  } catch (error) {
    logger.error(
      'JSON structured output failed',
      error instanceof Error ? error : undefined
    )
  }

  logger.info('Stage 1 Example Completed')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})