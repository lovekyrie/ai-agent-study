import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Writable } from 'node:stream'
import pino from 'pino'
import { Logger, getDefaultLogger, type LogContext } from '../src/index.js'

// 用 pino 子 logger 直写到内存 stream，便于断言实际输出
function captureLogs(level: pino.Level = 'trace') {
  const lines: Record<string, unknown>[] = []
  const stream = new Writable({
    write(chunk, _enc, cb) {
      const text = chunk.toString().trim()
      if (text) lines.push(JSON.parse(text))
      cb()
    },
  })
  const pinoLogger = pino({ level }, stream)
  return { logger: new Logger(pinoLogger), lines }
}

describe('Logger', () => {
  let logger: Logger

  beforeEach(() => {
    logger = new Logger({ level: 'info', pretty: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should create a logger instance', () => {
    expect(logger).toBeInstanceOf(Logger)
  })

  it('should log info message', () => {
    expect(() => logger.info('Test message')).not.toThrow()
  })

  it('should log info message with context', () => {
    const context: LogContext = { userId: '123', action: 'test' }
    expect(() => logger.info('Test message', context)).not.toThrow()
  })

  it('should log error message', () => {
    expect(() => logger.error('Error message')).not.toThrow()
  })

  it('should log error with Error object', () => {
    const error = new Error('Test error')
    expect(() => logger.error('Error occurred', error)).not.toThrow()
  })

  it('should create child logger', () => {
    const context: LogContext = { requestId: 'abc-123' }
    const child = logger.child(context)

    expect(child).toBeInstanceOf(Logger)
    expect(child).not.toBe(logger)
  })

  it('should set log level', () => {
    expect(() => logger.setLevel('debug')).not.toThrow()
  })

  it('should handle warning messages', () => {
    expect(() => logger.warn('Warning message')).not.toThrow()
  })

  it('should handle debug messages', () => {
    expect(() => logger.debug('Debug message')).not.toThrow()
  })

  it('should handle trace messages', () => {
    expect(() => logger.trace('Trace message')).not.toThrow()
  })

  it('emits structured info with context payload', () => {
    const { logger: l, lines } = captureLogs()
    l.info('hello', { userId: '1' })
    expect(lines).toHaveLength(1)
    expect(lines[0].msg).toBe('hello')
    expect(lines[0].userId).toBe('1')
  })

  it('serializes Error into structured fields', () => {
    const { logger: l, lines } = captureLogs()
    l.error('boom', new Error('oops'))
    const entry = lines[0] as { msg: string; error: { message: string; name: string } }
    expect(entry.msg).toBe('boom')
    expect(entry.error.message).toBe('oops')
    expect(entry.error.name).toBe('Error')
  })

  it('respects log level filter (warn drops info)', () => {
    const { logger: l, lines } = captureLogs('warn')
    l.info('skipped')
    l.warn('kept')
    expect(lines).toHaveLength(1)
    expect(lines[0].msg).toBe('kept')
  })

  it('child logger inherits context across levels', () => {
    const { logger: l, lines } = captureLogs()
    const child = l.child({ requestId: 'abc' })
    child.info('with-ctx')
    expect(lines[0].requestId).toBe('abc')
  })

  it('getDefaultLogger returns the same singleton', () => {
    expect(getDefaultLogger()).toBe(getDefaultLogger())
  })
})