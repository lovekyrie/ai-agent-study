import {
  AppServer,
  logger,
  TracingService,
  MetricsCollector,
  JobQueue,
  SessionManager,
  RateLimiter,
} from './index.js'

async function appServerDemo() {
  console.log('=== AppServer Demo ===\n')

  const server = new AppServer({
    port: 3000,
    jwtSecret: 'demo-secret-key',
    corsOrigins: ['http://localhost:3001'],
  })

  // Register routes
  server.registerAuthRoutes()
  server.registerSessionRoutes()
  server.registerMetricsRoutes()

  // Health check
  server.get('/health', async () => ({
    statusCode: 200,
    headers: {},
    body: { status: 'ok', timestamp: new Date().toISOString() },
  }))

  // User info endpoint (protected)
  server.get('/me', async (req) => ({
    statusCode: 200,
    headers: {},
    body: { userId: req.context?.userId },
  }))

  logger.info('AppServer configured')
}

async function tracingDemo() {
  console.log('\n=== Tracing Demo ===\n')

  const tracing = new TracingService('demo-service')

  // Start a trace
  const trace = tracing.startTrace('user-request', { userId: 'user-123' })
  console.log('Started trace:', trace.id)

  // Record a span
  const result = tracing.recordSpan(
    'llm-call',
    { model: 'gpt-4o', tokens: 1000 },
    (span) => {
      console.log('Processing with span:', span.id)
      // Simulate work
      return { result: 'success', output: 'Hello!' }
    }
  )

  console.log('Span result:', result)

  // End trace
  const finishedTrace = tracing.endTrace(trace.id)
  console.log('Trace duration:', finishedTrace?.duration, 'ms')
}

async function metricsDemo() {
  console.log('\n=== Metrics Demo ===\n')

  const metrics = new MetricsCollector()

  // Record some metrics
  metrics.increment('requests.total', { method: 'GET', path: '/health' })
  metrics.increment('requests.total', { method: 'POST', path: '/chat' })
  metrics.gauge('session.active', 42)
  metrics.timing('llm.response.time', 150, { model: 'gpt-4o' })
  metrics.timing('llm.response.time', 200, { model: 'gpt-4o-mini' })

  // Get summary
  const summary = metrics.summarize('llm.response.time')
  console.log('LLM Response Time Summary:', summary)

  // Get recent metrics
  const recent = metrics.get()
  console.log('Recent metrics count:', recent.length)
}

async function sessionManagerDemo() {
  console.log('\n=== Session Manager Demo ===\n')

  const sessionManager = new SessionManager(10) // Max 10 messages

  // Create session
  const session = sessionManager.createSession('user-123')
  console.log('Created session:', session.id)

  // Add messages
  sessionManager.addMessage(session.id, {
    role: 'user',
    content: 'Hello, how are you?',
  })
  sessionManager.addMessage(session.id, {
    role: 'assistant',
    content: 'I am doing well, thank you!',
  })

  // Get history
  const history = sessionManager.getHistory(session.id)
  console.log('History length:', history.length)

  // Get session
  const retrieved = sessionManager.getSession(session.id)
  console.log('Session userId:', retrieved?.userId)
}

async function rateLimiterDemo() {
  console.log('\n=== Rate Limiter Demo ===\n')

  const limiter = new RateLimiter(1000, 3) // 1 second window, 3 requests max

  // Simulate requests
  for (let i = 0; i < 5; i++) {
    const result = limiter.check('user-123')
    console.log(`Request ${i + 1}:`, result.allowed ? 'allowed' : 'blocked', '| Remaining:', result.remaining)
  }
}

async function queueDemo() {
  console.log('\n=== Job Queue Demo ===\n')

  const queue = new JobQueue<string>('demo-queue', {
    concurrency: 2,
    defaultJobOptions: { attempts: 3 },
  })

  // Listen to events
  queue.on('completed', (job) => {
    console.log('Job completed:', job.id, job.result)
  })

  queue.on('failed', (job, error) => {
    console.log('Job failed:', job.id, error)
  })

  // Process jobs
  await queue.process(async (job) => {
    console.log('Processing job:', job.id, job.data)
    await new Promise(resolve => setTimeout(resolve, 100))
    return `Processed: ${job.data}`
  })

  // Add jobs
  await queue.add('task-1', 'First task', { delay: 0 })
  await queue.add('task-2', 'Second task', { delay: 0 })

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 500))

  // Get counts
  const counts = await queue.getCounts()
  console.log('Queue counts:', counts)

  await queue.close()
}

async function main() {
  try {
    await appServerDemo()
    await tracingDemo()
    await metricsDemo()
    await sessionManagerDemo()
    await rateLimiterDemo()
    await queueDemo()
    console.log('\n=== Demo Complete ===')
  } catch (error) {
    logger.error('Demo failed', error as Error)
  }
}

main().catch(console.error)