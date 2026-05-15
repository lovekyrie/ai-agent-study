// Auth & Security
export { AuthService, RateLimiter, CacheService, UserService, type AuthToken, type Session as AuthSession, type User } from './auth.js'

// Session Management
export { SessionManager, CheckpointManager, requestContextStorage, getCurrentContext, runWithContext, type SessionData, type Message, type ToolCall, type WorkflowCheckpoint, type RequestContext as SessionRequestContext } from './session.js'

// Logging
export { logger, createRequestLogger, Logger, type LogLevel, type LogContext } from './logger.js'

// Tracing & Metrics
export { TracingService, MetricsCollector, getCurrentSpan, getCurrentTraceId, tracing, metricsCollector, type Span, type Trace, type Metric } from './tracing.js'

// Queue (Job Processing)
export { JobQueue, Worker, type Job, type JobState, type QueueOptions, type QueueEventType } from './queue.js'

// HTTP Server
export { HttpServer, withAuth, withCors, withJsonBody, type HttpRequest, type HttpResponse, type Route, type RouteHandler, type Middleware, type RequestContext } from './server.js'

// App Server - brings it all together
import { HttpServer, withAuth, withCors, withJsonBody } from './server.js'
import { AuthService, RateLimiter, CacheService } from './auth.js'
import { SessionManager } from './session.js'
import { logger } from './logger.js'
import { TracingService, MetricsCollector } from './tracing.js'
import { JobQueue } from './queue.js'
import { UserService } from './auth.js'

export interface AppConfig {
  port: number
  host?: string
  jwtSecret: string
  corsOrigins?: string[]
}

export class AppServer {
  private httpServer: HttpServer
  private authService: AuthService
  private userService: UserService
  private rateLimiter: RateLimiter
  private cacheService: CacheService
  private sessionManager: SessionManager
  private tracingService: TracingService
  private metricsCollector: MetricsCollector
  private queues: Map<string, JobQueue>

  constructor(config: AppConfig) {
    this.httpServer = new HttpServer()
    this.authService = new AuthService(config.jwtSecret)
    this.userService = new UserService()
    this.rateLimiter = new RateLimiter(60000, 100)
    this.cacheService = new CacheService()
    this.sessionManager = new SessionManager(100)
    this.tracingService = new TracingService()
    this.metricsCollector = new MetricsCollector()
    this.queues = new Map()

    // Add global middlewares
    this.httpServer.use(withCors({ origins: config.corsOrigins }))
    this.httpServer.use(withJsonBody())

    // Rate limiting middleware
    this.httpServer.use(async (req, res, next) => {
      const identifier = req.context?.userId || (req.headers['x-forwarded-for'] as string || 'unknown')
      const { allowed, remaining } = this.rateLimiter.check(identifier)

      res.headers['X-RateLimit-Remaining'] = String(remaining)

      if (!allowed) {
        res.statusCode = 429
        res.body = { error: 'Too many requests' }
        return
      }

      await next()
    })

    // Request logging middleware
    this.httpServer.use(async (req, _res, next) => {
      const ctx = req.context
      if (ctx) {
        logger.info(`${req.method} ${req.url}`, {
          requestId: ctx.requestId,
          userId: ctx.userId,
          duration: Date.now() - ctx.startTime,
        })
      }
      await next()
    })
  }

  // Auth endpoints
  registerAuthRoutes(): void {
    this.httpServer.post('/auth/register', async (req) => {
      const { email, password } = req.body as { email: string; password: string }
      if (!email || !password) {
        return { statusCode: 400, headers: {}, body: { error: 'Email and password required' } }
      }

      try {
        const user = await this.userService.createUser(email, password)
        const token = this.authService.generateToken(user.id)
        return {
          statusCode: 201,
          headers: {},
          body: { user: { id: user.id, email: user.email }, token },
        }
      } catch (error) {
        return {
          statusCode: 400,
          headers: {},
          body: { error: error instanceof Error ? error.message : 'Registration failed' },
        }
      }
    })

    this.httpServer.post('/auth/login', async (req) => {
      const { email, password } = req.body as { email: string; password: string }
      if (!email || !password) {
        return { statusCode: 400, headers: {}, body: { error: 'Email and password required' } }
      }

      const user = await this.userService.authenticate(email, password)
      if (!user) {
        return { statusCode: 401, headers: {}, body: { error: 'Invalid credentials' } }
      }

      const token = this.authService.generateToken(user.id)
      return { statusCode: 200, headers: {}, body: { user: { id: user.id, email: user.email }, token } }
    })
  }

  // Session endpoints
  registerSessionRoutes(): void {
    this.httpServer.post('/sessions', async (req) => {
      const userId = req.context?.userId
      if (!userId) {
        return { statusCode: 401, headers: {}, body: { error: 'Unauthorized' } }
      }

      const session = this.sessionManager.createSession(userId)
      return { statusCode: 201, headers: {}, body: { session } }
    }, [withAuth(this.authService)])

    this.httpServer.get('/sessions/:sessionId', async (req) => {
      const session = this.sessionManager.getSession(req.params.sessionId)
      if (!session) {
        return { statusCode: 404, headers: {}, body: { error: 'Session not found' } }
      }

      if (req.context?.userId && session.userId !== req.context.userId) {
        return { statusCode: 403, headers: {}, body: { error: 'Forbidden' } }
      }

      return { statusCode: 200, headers: {}, body: { session } }
    }, [withAuth(this.authService)])

    this.httpServer.get('/sessions/:sessionId/history', async (req) => {
      const session = this.sessionManager.getSession(req.params.sessionId)
      if (!session) {
        return { statusCode: 404, headers: {}, body: { error: 'Session not found' } }
      }
      if (session.userId !== req.context?.userId) {
        return { statusCode: 403, headers: {}, body: { error: 'Forbidden' } }
      }
      const limit = req.query.limit ? parseInt(req.query.limit) : undefined
      const history = this.sessionManager.getHistory(req.params.sessionId, limit)
      return { statusCode: 200, headers: {}, body: { history } }
    }, [withAuth(this.authService)])

    this.httpServer.post('/sessions/:sessionId/messages', async (req) => {
      const session = this.sessionManager.getSession(req.params.sessionId)
      if (!session) {
        return { statusCode: 404, headers: {}, body: { error: 'Session not found' } }
      }
      if (session.userId !== req.context?.userId) {
        return { statusCode: 403, headers: {}, body: { error: 'Forbidden' } }
      }
      const { role, content, toolCalls } = req.body as { role: string; content: string; toolCalls?: unknown }
      const message = this.sessionManager.addMessage(req.params.sessionId, { role: role as 'user' | 'assistant' | 'system' | 'tool', content, toolCalls: toolCalls as any })
      if (!message) {
        return { statusCode: 404, headers: {}, body: { error: 'Session not found' } }
      }
      return { statusCode: 201, headers: {}, body: { message } }
    }, [withAuth(this.authService)])
  }

  // Queue management
  createQueue<T>(name: string, options?: { concurrency?: number; attempts?: number }): JobQueue<T> {
    const queue = new JobQueue<T>(name, { concurrency: options?.concurrency, defaultJobOptions: { attempts: options?.attempts } })
    this.queues.set(name, queue as unknown as JobQueue)
    return queue
  }

  getQueue<T>(name: string): JobQueue<T> | undefined {
    return this.queues.get(name) as unknown as JobQueue<T> | undefined
  }

  // Metrics endpoint
  registerMetricsRoutes(): void {
    this.httpServer.get('/metrics/summary', async (req) => {
      const windowMs = req.query.window ? parseInt(req.query.window) : undefined
      const name = req.query.name as string | undefined

      if (name) {
        return { statusCode: 200, headers: {}, body: this.metricsCollector.summarize(name, windowMs) }
      }

      return {
        statusCode: 200,
        headers: {},
        body: this.metricsCollector.get().slice(-100),
      }
    })

    this.httpServer.get('/health', async () => {
      return {
        statusCode: 200,
        headers: {},
        body: {
          status: 'ok',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        },
      }
    })
  }

  async listen(port: number, host?: string): Promise<void> {
    await this.httpServer.listen(port, host)
    logger.info(`Server listening on ${host || '0.0.0.0'}:${port}`)
  }

  async close(): Promise<void> {
    // Close all queues
    for (const queue of this.queues.values()) {
      await queue.close()
    }
    await this.httpServer.close()
    logger.info('Server closed')
  }

  // Expose services for testing
  getAuthService(): AuthService { return this.authService }
  getUserService(): UserService { return this.userService }
  getSessionManager(): SessionManager { return this.sessionManager }
  getCacheService(): CacheService { return this.cacheService }
  getRateLimiter(): RateLimiter { return this.rateLimiter }
  getTracingService(): TracingService { return this.tracingService }
  getMetricsCollector(): MetricsCollector { return this.metricsCollector }

  // HTTP method helpers - delegate to internal httpServer
  get(path: string, handler: (req: import('./server.js').HttpRequest) => Promise<import('./server.js').HttpResponse>, middlewares?: import('./server.js').Middleware[]): void {
    this.httpServer.get(path, handler, middlewares)
  }

  post(path: string, handler: (req: import('./server.js').HttpRequest) => Promise<import('./server.js').HttpResponse>, middlewares?: import('./server.js').Middleware[]): void {
    this.httpServer.post(path, handler, middlewares)
  }

  put(path: string, handler: (req: import('./server.js').HttpRequest) => Promise<import('./server.js').HttpResponse>, middlewares?: import('./server.js').Middleware[]): void {
    this.httpServer.put(path, handler, middlewares)
  }

  delete(path: string, handler: (req: import('./server.js').HttpRequest) => Promise<import('./server.js').HttpResponse>, middlewares?: import('./server.js').Middleware[]): void {
    this.httpServer.delete(path, handler, middlewares)
  }

  patch(path: string, handler: (req: import('./server.js').HttpRequest) => Promise<import('./server.js').HttpResponse>, middlewares?: import('./server.js').Middleware[]): void {
    this.httpServer.patch(path, handler, middlewares)
  }
}
