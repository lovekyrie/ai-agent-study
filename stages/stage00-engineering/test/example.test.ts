import type { LogContext } from '@ai-agent-study/logger'
import {
  applyTestEnv,
  clearTestEnv,
  getConfig,
  loadConfig,
  resetConfigCache,
} from '@ai-agent-study/config'
import { Logger } from '@ai-agent-study/logger'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('stage 0: Engineering Foundation', () => {
  beforeEach(() => {
    resetConfigCache()
    applyTestEnv()
  })

  afterEach(() => {
    resetConfigCache()
    clearTestEnv()
  })

  describe('config Integration', () => {
    it('should load config and access all sections', () => {
      const config = getConfig()

      expect(config.llm).toBeDefined()
      expect(config.vectorDB).toBeDefined()
      expect(config.database).toBeDefined()
      expect(config.redis).toBeDefined()
      expect(config.app).toBeDefined()
      expect(config.security).toBeDefined()
    })

    it('should have correct default LLM settings', () => {
      const config = loadConfig()

      expect(config.llm.model).toBe('gpt-4o')
      expect(config.llm.temperature).toBe(0.7)
      expect(config.llm.maxTokens).toBe(1000)
    })

    it('should parse temperature as float', () => {
      process.env.DEFAULT_TEMPERATURE = '0.5'
      const config = loadConfig()
      expect(config.llm.temperature).toBe(0.5)
      delete process.env.DEFAULT_TEMPERATURE
    })
  })

  describe('logger Integration', () => {
    it('should create logger with config log level', () => {
      const config = getConfig()
      const logger = new Logger({
        name: 'stage00-test',
        level: config.app.logLevel,
        pretty: false,
      })

      expect(logger).toBeInstanceOf(Logger)
    })

    it('should log with context without errors', () => {
      const logger = new Logger({ level: 'info', pretty: false })
      const context: LogContext = { stage: 0, module: 'test' }

      expect(() => logger.info('Test message', context)).not.toThrow()
      expect(() => logger.warn('Warning', context)).not.toThrow()
      expect(() => logger.error('Error occurred')).not.toThrow()
    })

    it('should create child logger with context', () => {
      const logger = new Logger({ level: 'info', pretty: false })
      const child = logger.child({ requestId: 'test-123' })

      expect(child).toBeInstanceOf(Logger)
      expect(() => child.info('Child log')).not.toThrow()
    })
  })
})
