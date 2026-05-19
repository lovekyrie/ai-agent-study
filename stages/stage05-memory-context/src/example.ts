import { Logger } from '@ai-agent-study/logger'
import { createLLMClient } from '@ai-agent-study/llm-client'
import {
  Session,
  enforceBudget,
  estimateMessages,
  cjkEstimator,
  defaultEstimator,
} from './index.js'

/**
 * Stage 05 端到端 demo：
 *   1. 构造一个 Session（含 in-memory 长期记忆）
 *   2. 模拟 50 轮用户/助手对话
 *   3. 演示 token 预算"被动兜底"裁剪
 *   4. 演示 "主动摘要压缩"（需要真实 LLM；缺 API key 时跳过）
 *   5. 演示长期记忆检索如何影响最终 prompt
 *
 * 期望读者关注的三个数字（运行时打印）：
 *   - kept / dropped：兜底裁剪丢了多少条
 *   - summary length：压缩成多长一段
 *   - retrieved：长期记忆检索到几条
 */
async function main() {
  const logger = new Logger({ name: 'stage05-example', level: 'info' })
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY)

  const session = Session.withInMemoryLongTerm({
    systemPrompt:
      '你是一个善于记忆上下文的助手。你只会用中文回答，回答尽量简洁。',
    maxShortTerm: 60,
    llmClient: hasApiKey ? createLLMClient() : undefined,
  })

  // —— 1) 灌入 50 轮模拟对话 ——
  logger.info('--- 1. Simulating 50 turns of conversation ---')
  for (let i = 0; i < 25; i++) {
    session.addUserMessage(`第 ${i + 1} 轮用户问题：请帮我记住数字 ${i * 7}`)
    session.addAssistantMessage(`好的，已经记住 ${i * 7}。`)
  }
  logger.info('Session size after seeding', { shortTermSize: session.shortTerm.size() })

  // —— 2) 把一条事实"提升"到长期记忆 ——
  const fact = session.addUserMessage('我最喜欢的数字是 42。')
  await session.promoteToLongTerm(fact.id)
  session.addAssistantMessage('已经把 42 记到长期记忆里了。')

  // —— 3) 演示 token budget 兜底裁剪 ——
  logger.info('--- 2. Passive budget enforcement (no LLM call) ---')
  const noBudget = await session.getMessagesForLLM()
  const tightBudget = await session.getMessagesForLLM({
    budget: { maxTokens: 300, reservedForResponse: 100 },
  })
  logger.info('Budget comparison', {
    noBudgetMessages: noBudget.messages.length,
    noBudgetTokens: noBudget.tokensUsed,
    tightBudgetMessages: tightBudget.messages.length,
    tightBudgetTokens: tightBudget.tokensUsed,
    droppedByBudget: tightBudget.trimmedCount,
  })

  // —— 4) 演示长期记忆检索 ——
  logger.info('--- 3. Long-term retrieval injection ---')
  const withRetrieval = await session.getMessagesForLLM({
    retrievalQuery: '最喜欢的数字',
    longTermTopK: 3,
  })
  logger.info('Retrieval result', {
    totalMessages: withRetrieval.messages.length,
    retrieved: withRetrieval.retrievedCount,
    firstSystemBlocks: withRetrieval.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content.slice(0, 40)),
  })

  // —— 5) 演示两种估算器的差异 ——
  logger.info('--- 4. Estimator comparison ---')
  const tokensDefault = estimateMessages(noBudget.messages, defaultEstimator)
  const tokensCJK = estimateMessages(noBudget.messages, cjkEstimator)
  logger.info('Estimator delta', { tokensDefault, tokensCJK })

  // —— 6) 演示 enforceBudget 单独使用（不需要 Session） ——
  const trimmed = enforceBudget(noBudget.messages, {
    maxTokens: 200,
    reservedForResponse: 50,
  })
  logger.info('Standalone enforceBudget', {
    inputMessages: noBudget.messages.length,
    outputMessages: trimmed.messages.length,
    trimmedCount: trimmed.trimmedCount,
    tokensUsed: trimmed.tokensUsed,
  })

  // —— 7) 主动摘要压缩（需要 LLM）——
  if (!hasApiKey) {
    logger.warn('Skipping compress() demo (set OPENAI_API_KEY to try it)')
    logger.info('Stage 5 example completed')
    return
  }

  logger.info('--- 5. Active compression via LLM ---')
  try {
    const before = session.shortTerm.size()
    const result = await session.compress({ keepRecent: 4, maxTokens: 300 })
    if (result) {
      logger.info('Compressed', {
        before,
        afterShortTerm: session.shortTerm.size(),
        summarized: result.summarizedCount,
        summaryLength: result.summary.length,
        summaryPreview: result.summary.slice(0, 80),
      })

      // 压缩后再拿 messages：应当能看到摘要 system 节点
      const afterCompress = await session.getMessagesForLLM()
      logger.info('Post-compress messages', {
        total: afterCompress.messages.length,
        systemBlocks: afterCompress.messages.filter((m) => m.role === 'system').length,
      })
    }
  } catch (error) {
    logger.error('compress() failed', error instanceof Error ? error : undefined)
  }

  logger.info('Stage 5 example completed')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
