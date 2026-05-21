# Stage 11: Production Engineering

生产级服务**教学模拟**：JWT、会话、结构化日志、追踪、指标、任务队列、输入净化等均以**内存实现**演示接口与流程；真实 Postgres / Redis / OpenTelemetry 见文末「生产部署注意事项」。

## 核心功能

- **AuthService**: JWT token 生成/验证、密码哈希、会话管理
- **UserService**: 用户注册/认证
- **RateLimiter**: 基于滑动窗口的请求限流
- **CacheService**: TTL 缓存
- **SessionManager**: 会话管理和消息历史
- **Logger**: 结构化日志 (pino)
- **TracingService**: OpenTelemetry 风格的分布式追踪
- **MetricsCollector**: 指标收集和聚合
- **JobQueue**: 异步任务队列 (BullMQ 风格)
- **HttpServer**: 基础 HTTP 服务器
- **AppServer**: 整合所有功能的应用程序服务器

## 目录结构

```
src/
├── auth.ts      # 鉴权、限流、缓存
├── session.ts   # 会话管理、检查点
├── logger.ts    # 结构化日志
├── tracing.ts   # 追踪和指标
├── queue.ts     # 任务队列
├── server.ts    # HTTP 服务器
├── index.ts     # AppServer 整合
```

## 使用示例

### AppServer - 完整应用服务器

```typescript
import { AppServer, logger } from './index.js'

const server = new AppServer({
  port: 3000,
  jwtSecret: 'your-secret-key',
  corsOrigins: ['http://localhost:3001'],
})

// 注册路由
server.registerAuthRoutes()
server.registerSessionRoutes()
server.registerMetricsRoutes()

// 自定义路由
server.get('/custom', async req => ({
  statusCode: 200,
  headers: {},
  body: { message: 'Hello' },
}))

// 启动服务
await server.listen(3000)
```

### 认证

```typescript
import { AuthService } from './index.js'

const auth = new AuthService('jwt-secret')

// 创建 token
const token = auth.generateToken('user-123')
console.log(token)

// 验证 token
const result = auth.verifyToken(token.token)
console.log(result.valid) // true
```

### 限流

```typescript
import { RateLimiter } from './index.js'

const limiter = new RateLimiter(60000, 100) // 1分钟窗口，100请求

const result = limiter.check('user-identifer')
if (!result.allowed) {
  console.log('Too many requests')
}
```

### 缓存

```typescript
import { CacheService } from './index.js'

const cache = new CacheService()
cache.set('key', 'value', 5000) // 5秒 TTL

const value = cache.get('key') // 'value'
```

### 任务队列

```typescript
import { JobQueue } from './index.js'

const queue = new JobQueue('my-queue', {
  concurrency: 2,
  defaultJobOptions: { attempts: 3 },
})

queue.on('completed', (job) => {
  console.log('Job done:', job.result)
})

await queue.process(async (job) => {
  // 处理任务
  return `Result: ${job.data}`
})

await queue.add('task-1', 'First task')
```

### 追踪

```typescript
import { TracingService } from './index.js'

const tracing = new TracingService()

const result = tracing.recordSpan(
  'llm-call',
  { model: 'gpt-4o' },
  (span) => {
    // 你的逻辑
    return { output: 'result' }
  }
)
```

### 指标

```typescript
import { MetricsCollector } from './index.js'

const metrics = new MetricsCollector()

metrics.increment('requests.total')
metrics.timing('llm.response.time', 150, { model: 'gpt-4o' })

const summary = metrics.summarize('llm.response.time')
console.log(summary.avg)
```

## 运行

```bash
cp .env.example .env
pnpm --filter stage11-production test
pnpm --filter stage11-production dev
```

## 生产部署注意事项

1. **存储**: 会话/队列使用内存存储，生产环境应使用 Redis/PostgreSQL
2. **日志**: 生产环境禁用 pino-pretty，使用结构化 JSON
3. **追踪**: 集成 OpenTelemetry Collector 导出到 Jaeger/Tempo
4. **指标**: 集成 Prometheus Pushgateway 或 Pull 模型
5. **队列**: 生产环境使用 BullMQ + Redis
