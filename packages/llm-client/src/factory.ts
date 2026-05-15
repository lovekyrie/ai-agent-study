import { LLMClient } from './client.js'
import type { LLMConfig } from './types.js'

function parseFloatSafe(value: string | undefined, fallback: number, key: string): number {
  if (value === undefined || value === '') return fallback
  const n = Number.parseFloat(value)
  if (!Number.isFinite(n)) throw new Error(`${key} must be a valid number, got: ${value}`)
  return n
}

function parseIntSafe(value: string | undefined, fallback: number, key: string): number {
  if (value === undefined || value === '') return fallback
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n)) throw new Error(`${key} must be a valid integer, got: ${value}`)
  return n
}

/**
 * 从 env + 用户传入的覆盖项构造 LLMClient。
 * 优先级：用户传入 > 环境变量 > 默认值（始终保持一致）。
 */
export function createLLMClient(config?: Partial<LLMConfig>): LLMClient {
  const apiKey = config?.apiKey ?? process.env.OPENAI_API_KEY ?? ''
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set (pass via config or env)')
  }

  const merged: LLMConfig = {
    apiKey,
    baseURL: config?.baseURL ?? process.env.OPENAI_API_BASE ?? 'https://api.openai.com/v1',
    model: config?.model ?? process.env.DEFAULT_MODEL ?? 'gpt-4o',
    temperature:
      config?.temperature ?? parseFloatSafe(process.env.DEFAULT_TEMPERATURE, 0.7, 'DEFAULT_TEMPERATURE'),
    maxTokens:
      config?.maxTokens ?? parseIntSafe(process.env.DEFAULT_MAX_TOKENS, 1000, 'DEFAULT_MAX_TOKENS'),
    timeout: config?.timeout ?? 120_000,
    maxRetries: config?.maxRetries ?? 3,
    topP: config?.topP ?? 1.0,
  }

  return new LLMClient(merged)
}

/**
 * 从已加载的 LLMConfig 构造客户端（推荐：由 stage 显式调用 getConfig() 后传入）。
 * 避免 llm-client 隐式依赖 @ai-agent-study/config。
 */
export function createLLMClientFromConfig(
  llmConfig: {
    apiKey: string
    baseURL: string
    model: string
    temperature?: number
    maxTokens?: number
  },
  overrides?: Partial<LLMConfig>
): LLMClient {
  return new LLMClient({
    apiKey: overrides?.apiKey ?? llmConfig.apiKey,
    baseURL: overrides?.baseURL ?? llmConfig.baseURL,
    model: overrides?.model ?? llmConfig.model,
    temperature: overrides?.temperature ?? llmConfig.temperature ?? 0.7,
    maxTokens: overrides?.maxTokens ?? llmConfig.maxTokens ?? 1000,
    timeout: overrides?.timeout ?? 120_000,
    maxRetries: overrides?.maxRetries ?? 3,
    topP: overrides?.topP ?? 1.0,
  })
}
