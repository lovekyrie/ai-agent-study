import type { Config } from '@ai-agent-study/config'
import { getConfig } from '@ai-agent-study/config'

export interface ApiRuntimeConfig {
  port: number
  frontendOrigin: string
  llm: {
    apiKey: string
    baseURL: string
    model: string
    temperature: number
    maxTokens: number
  }
}

function parseNumberEnv(key: string, fallback: number): number {
  const raw = process.env[key]
  if (raw === undefined || raw === '')
    return fallback
  const value = Number(raw)
  if (!Number.isFinite(value))
    throw new TypeError(`Environment variable ${key} must be a number, got: ${raw}`)
  return value
}

function toApiConfig(config: Config): ApiRuntimeConfig {
  return {
    port: config.app.port,
    frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    llm: config.llm,
  }
}

function isMissingApiKeyConfigError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('llm.apiKey')
}

export function readApiConfig(): ApiRuntimeConfig {
  try {
    return toApiConfig(getConfig())
  }
  catch (error) {
    if (!isMissingApiKeyConfigError(error))
      throw error
  }

  return {
    port: parseNumberEnv('PORT', 3000),
    frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    llm: {
      apiKey: '',
      baseURL: process.env.OPENAI_API_BASE || 'https://api.minimaxi.com/v1',
      model: process.env.DEFAULT_MODEL || 'MiniMax-M2.7',
      temperature: parseNumberEnv('DEFAULT_TEMPERATURE', 0.7),
      maxTokens: parseNumberEnv('DEFAULT_MAX_TOKENS', 1000),
    },
  }
}
