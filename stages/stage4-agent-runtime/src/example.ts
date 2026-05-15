import { getConfig } from '@ai-agent-study/config'
import { Logger } from '@ai-agent-study/logger'
import { builtinTools } from '@ai-agent-study/tools'
import { Agent } from './agent.js'

async function runTask(logger: Logger, agent: Agent, label: string, task: string) {
  logger.info(`\n========== ${label} ==========`)
  logger.info(`Task: ${task}`)
  const response = await agent.run(task)

  logger.info(`Status: ${response.status} | iterations: ${response.trace.iterations}`)
  for (const step of response.trace.steps) {
    const callSummary =
      step.toolCalls.length > 0
        ? step.toolCalls
            .map((c) => `${c.name}(${JSON.stringify(c.arguments)})`)
            .join(', ')
        : '<final answer>'
    console.log(`  [step ${step.stepNumber}] ${callSummary}`)
    for (const result of step.toolResults) {
      const text = result.error ? `ERROR: ${result.error}` : result.content
      console.log(`     → ${text.slice(0, 120)}${text.length > 120 ? '...' : ''}`)
    }
  }
  console.log(`\nFinal: ${response.message}`)
}

async function main() {
  const config = getConfig()
  const logger = new Logger({ name: 'stage4-example', level: config.app.logLevel })

  const agent = new Agent({
    tools: builtinTools,
    // 演示用显式授权；生产应该来自人工审批流
    permissions: ['approve'],
    maxIterations: 6,
    onStep: (step) => {
      if (step.error) console.error(`[step ${step.stepNumber}] error: ${step.error}`)
    },
  })

  logger.info('Stage 4: Agent Runtime - ReAct Loop')

  await runTask(logger, agent, 'Task 1: 单工具调用', '现在几点了？请用工具获取，时区使用 Asia/Shanghai。')

  await runTask(logger, agent, 'Task 2: 计算', '请计算 (789 + 211) * 1234 的结果。')

  await runTask(
    logger,
    agent,
    'Task 3: 多步推理',
    '请帮我：1）获取当前时间（Asia/Shanghai 时区）；2）告诉我现在大约是上午、下午还是晚上。'
  )

  await runTask(
    logger,
    agent,
    'Task 4: 并行工具',
    '请同时获取当前时间，以及计算 sqrt 是不支持的，请直接计算 2 ** 10 是多少。'
  )

  logger.info('\nStage 4 completed')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
