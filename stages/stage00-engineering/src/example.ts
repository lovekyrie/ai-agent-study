import { getConfig } from '@ai-agent-study/config'
import { Logger } from '@ai-agent-study/logger'

async function main() {
  const config = getConfig()
  const logger = new Logger({
    name: 'stage00-example',
    level: config.app.logLevel,
    pretty: config.app.logPretty,
  })

  logger.info('Stage 0 Example Started', {
    environment: config.app.nodeEnv,
    port: config.app.port,
  })

  logger.debug('LLM Configuration', {
    model: config.llm.model,
    baseURL: config.llm.baseURL,
    temperature: config.llm.temperature,
  })

  logger.info('Configuration loaded successfully', {
    components: ['llm', 'vectorDB', 'database', 'redis', 'app', 'security'],
  })

  try {
    logger.info('Simulating some work...')
    await new Promise(resolve => setTimeout(resolve, 1000))
    logger.info('Work completed successfully')
  }
  catch (error) {
    logger.error('Work failed', error instanceof Error ? error : undefined)
  }

  logger.warn('This is a warning message')
  logger.error('This is an error message')

  logger.info('Stage 0 Example Completed')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
