import dotenv from 'dotenv'
import { ConfigSchema, type Config } from './schemas.js'
import type { z } from 'zod'

function getEnvString(key: string, defaultValue?: string): string {
  return process.env[key] || defaultValue || ''
}

function parseNumeric(
  key: string,
  defaultValue: number,
  parser: (raw: string) => number
): number {
  const raw = process.env[key]
  if (raw === undefined || raw === '') return defaultValue
  const n = parser(raw)
  if (!Number.isFinite(n)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${raw}`)
  }
  return n
}

function getEnvNumber(key: string, defaultValue: number): number {
  return parseNumeric(key, defaultValue, (raw) => Number(raw))
}

function getEnvFloat(key: string, defaultValue: number): number {
  return parseNumeric(key, defaultValue, (raw) => Number.parseFloat(raw))
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key]
  if (!value) return defaultValue
  return value.toLowerCase() === 'true'
}

export function loadConfig(): Config {
  dotenv.config()

  const rawConfig = {
    llm: {
      apiKey: getEnvString('OPENAI_API_KEY'),
      baseURL: getEnvString('OPENAI_API_BASE', 'https://api.openai.com/v1'),
      model: getEnvString('DEFAULT_MODEL', 'gpt-4o'),
      temperature: getEnvFloat('DEFAULT_TEMPERATURE', 0.7),
      maxTokens: getEnvNumber('DEFAULT_MAX_TOKENS', 1000),
    },
    vectorDB: {
      host: getEnvString('CHROMA_HOST', 'localhost'),
      port: getEnvNumber('CHROMA_PORT', 8000),
      apiKey: getEnvString('CHROMA_API_KEY'),
      persistDirectory: getEnvString('CHROMA_PERSIST_DIRECTORY', './chroma_data'),
    },
    database: {
      url: getEnvString(
        'DATABASE_URL',
        'postgresql://user:pass@localhost:5432/agent'
      ),
      poolSize: getEnvNumber('DATABASE_POOL_SIZE', 10),
    },
    redis: {
      url: getEnvString('REDIS_URL', 'redis://localhost:6379'),
      maxRetries: getEnvNumber('REDIS_MAX_RETRIES', 3),
    },
    app: {
      port: getEnvNumber('PORT', 3000),
      // enum 校验交给 zod schema，避免危险的 as 断言
      nodeEnv: getEnvString('NODE_ENV', 'development'),
      logLevel: getEnvString('LOG_LEVEL', 'info'),
      logPretty: getEnvBoolean('LOG_PRETTY', true),
    },
    security: {
      secretKey: getEnvString('SECRET_KEY', 'dev-only-change-this-in-production-env'),
      jwtSecret: getEnvString('JWT_SECRET', 'dev-only-change-this-in-production-env'),
      rateLimitWindowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 900000),
      rateLimitMaxRequests: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100),
    },
  }

  const result = ConfigSchema.safeParse(rawConfig)

  if (!result.success) {
    const errors = result.error.errors
      .map((e: z.ZodIssue) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n')
    throw new Error(`Configuration validation failed:\n${errors}`)
  }

  return result.data
}

let cachedConfig: Config | null = null

export function getConfig(): Config {
  if (!cachedConfig) {
    cachedConfig = loadConfig()
  }
  return cachedConfig
}

export function resetConfigCache(): void {
  cachedConfig = null
}