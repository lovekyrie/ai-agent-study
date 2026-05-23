import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getConfig, loadConfig, resetConfigCache } from '../src/loader.js'
import { applyTestEnv, clearTestEnv, loadTestEnvFile } from '../src/testing.js'

const testEnv = loadTestEnvFile()

describe('config Loader', () => {
  beforeEach(() => {
    resetConfigCache()
    applyTestEnv()
  })

  afterEach(() => {
    resetConfigCache()
    clearTestEnv()
  })

  it('should load config with default values', () => {
    const config = loadConfig()

    expect(config.llm.apiKey).toBe(testEnv.OPENAI_API_KEY)
    expect(config.llm.baseURL).toBe(testEnv.OPENAI_API_BASE)
    expect(config.llm.model).toBe(testEnv.DEFAULT_MODEL)
    expect(config.llm.temperature).toBe(0.7)
    expect(config.llm.maxTokens).toBe(1000)
  })

  it('should throw on non-numeric PORT (NaN guard)', () => {
    process.env.PORT = 'not-a-number'
    expect(() => loadConfig()).toThrow(/PORT must be a number/)
    delete process.env.PORT
  })

  it('should reject SECRET_KEY shorter than 32 chars', () => {
    process.env.SECRET_KEY = 'short'
    expect(() => loadConfig()).toThrow(/Secret key/)
    process.env.SECRET_KEY = 'x'.repeat(32)
  })

  it('should load config from environment variables', () => {
    // 覆盖配置的默认值
    process.env.OPENAI_API_BASE = 'https://custom.api.com/v1'
    process.env.DEFAULT_MODEL = 'gpt-4o-mini'
    process.env.PORT = '4000'

    const config = loadConfig()

    expect(config.llm.baseURL).toBe('https://custom.api.com/v1')
    expect(config.llm.model).toBe('gpt-4o-mini')
    expect(config.app.port).toBe(4000)

    delete process.env.OPENAI_API_BASE
    delete process.env.DEFAULT_MODEL
    delete process.env.PORT
  })

  it('should cache config', () => {
    const config1 = getConfig()
    const config2 = getConfig()

    expect(config1).toBe(config2)
  })

  it('should reset config cache', () => {
    const config1 = getConfig()
    resetConfigCache()
    const config2 = getConfig()

    expect(config1).not.toBe(config2)
  })

  it('should throw error for invalid API key', () => {
    // 采用空字符串， dotenv 不会覆盖已存在的 env
    process.env.OPENAI_API_KEY = ''

    expect(() => loadConfig()).toThrow('API Key is required')
  })

  it('should parse boolean correctly', () => {
    process.env.LOG_PRETTY = 'false'
    const config = loadConfig()
    expect(config.app.logPretty).toBe(false)

    process.env.LOG_PRETTY = 'true'
    const config2 = loadConfig()
    expect(config2.app.logPretty).toBe(true)

    delete process.env.LOG_PRETTY
  })
})
