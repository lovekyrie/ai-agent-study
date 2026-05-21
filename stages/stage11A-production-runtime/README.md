# Stage 11A: Production Runtime

把 Agent 后端服务的协议面补齐：SSE 流式事件、request context、run id、tool/retrieval/workflow/final event。

## 核心能力

- Agent stream event 协议
- SSE 编码
- request/session/user/trace context
- 未来可接 Fastify 或 NestJS

## 运行

```bash
pnpm --filter stage11a-production-runtime test
pnpm --filter stage11a-production-runtime dev
```

## 下一步

- 接 Fastify route：`POST /api/chat`
- 接 JWT middleware
- 接 Redis queue 和 Postgres run store
- 接 Docker Compose 生产依赖
