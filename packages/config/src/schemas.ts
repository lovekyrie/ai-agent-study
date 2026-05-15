import { z } from 'zod'

export const LLMConfigSchema = z.object({
  apiKey: z.string().min(1, 'API Key is required'),
  baseURL: z.string().url().default('https://api.openai.com/v1'),
  model: z.string().default('gpt-4o'),
  temperature: z.number().min(0).max(2).default(0.7),
  // 上限按主流模型最大上下文做一次 sanity check
  maxTokens: z.number().int().min(1).max(200_000).default(1000),
})

export const VectorDBConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().int().positive().default(8000),
  apiKey: z.string().optional(),
  persistDirectory: z.string().default('./chroma_data'),
})

export const DatabaseConfigSchema = z.object({
  url: z.string().min(1, 'Database URL is required'),
  poolSize: z.number().int().positive().default(10),
})

export const RedisConfigSchema = z.object({
  url: z.string().min(1).default('redis://localhost:6379'),
  maxRetries: z.number().int().nonnegative().default(3),
})

export const AppConfigSchema = z.object({
  port: z.number().int().positive().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  logPretty: z.boolean().default(true),
})

export const SecurityConfigSchema = z.object({
  secretKey: z.string().min(32, 'Secret key must be at least 32 chars'),
  jwtSecret: z.string().min(32, 'JWT secret must be at least 32 chars'),
  rateLimitWindowMs: z.number().int().positive().default(900000),
  rateLimitMaxRequests: z.number().int().positive().default(100),
})

export const ConfigSchema = z.object({
  llm: LLMConfigSchema,
  vectorDB: VectorDBConfigSchema,
  database: DatabaseConfigSchema,
  redis: RedisConfigSchema,
  app: AppConfigSchema,
  security: SecurityConfigSchema,
})

export type LLMConfig = z.infer<typeof LLMConfigSchema>
export type VectorDBConfig = z.infer<typeof VectorDBConfigSchema>
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>
export type RedisConfig = z.infer<typeof RedisConfigSchema>
export type AppConfig = z.infer<typeof AppConfigSchema>
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>
export type Config = z.infer<typeof ConfigSchema>