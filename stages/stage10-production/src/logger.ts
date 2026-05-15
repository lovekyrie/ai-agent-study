import pino from 'pino'

// Structured log levels
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface LogContext {
  requestId?: string
  userId?: string
  sessionId?: string
  operation?: string
  duration?: number
  [key: string]: unknown
}

class Logger {
  private logger: pino.Logger

  constructor() {
    this.logger = pino.default({
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
      base: {
        service: 'ai-agent-study',
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    })
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): Record<string, unknown> {
    return {
      level,
      msg: message,
      ...context,
    }
  }

  trace(message: string, context?: LogContext): void {
    this.logger.trace(this.formatMessage('trace', message, context))
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(this.formatMessage('debug', message, context))
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(this.formatMessage('info', message, context))
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(this.formatMessage('warn', message, context))
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.logger.error({
      ...this.formatMessage('error', message, context),
      err: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : undefined,
    })
  }

  fatal(message: string, error?: Error, context?: LogContext): void {
    this.logger.fatal({
      ...this.formatMessage('fatal', message, context),
      err: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : undefined,
    })
  }

  // Child logger with fixed context
  child(bindings: Record<string, unknown>): ChildLogger {
    return new ChildLogger(this.logger.child(bindings))
  }

  // Metric logging
  metric(name: string, value: number, tags?: Record<string, string>): void {
    this.logger.info({
      type: 'metric',
      metric: name,
      value,
      tags,
    })
  }
}

class ChildLogger {
  private logger: pino.Logger

  constructor(logger: pino.Logger) {
    this.logger = logger
  }

  trace(message: string, context?: LogContext): void {
    this.logger.trace({ ...context, msg: message })
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug({ ...context, msg: message })
  }

  info(message: string, context?: LogContext): void {
    this.logger.info({ ...context, msg: message })
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn({ ...context, msg: message })
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.logger.error({ ...context, msg: message, err: error ? { message: error.message, stack: error.stack } : undefined })
  }
}

// Global logger instance
export const logger = new Logger()

// Request logger middleware helper
export function createRequestLogger(requestId: string, userId?: string) {
  return logger.child({ requestId, userId })
}

export { Logger }