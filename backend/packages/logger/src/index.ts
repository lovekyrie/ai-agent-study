import type { Level, LoggerOptions } from 'pino'
import pino from 'pino'

export interface LoggerConfig {
  level?: Level
  pretty?: boolean
  name?: string
  redact?: string[]
}

export interface LogContext {
  [key: string]: unknown
}

function resolvePretty(explicit: boolean | undefined): boolean {
  if (explicit !== undefined)
    return explicit
  const envValue = process.env.LOG_PRETTY
  if (envValue === undefined)
    return true
  return envValue.toLowerCase() !== 'false'
}

class Logger {
  private logger: pino.Logger

  constructor(configOrPino: LoggerConfig | pino.Logger = {}) {
    // 内部分支：用已有 pino 实例构造（供 child 复用）
    if (typeof (configOrPino as pino.Logger).child === 'function'
      && typeof (configOrPino as pino.Logger).level === 'string') {
      this.logger = configOrPino as pino.Logger
      return
    }

    const config = configOrPino as LoggerConfig
    const options: LoggerOptions = {
      level: config.level || (process.env.LOG_LEVEL as Level) || 'info',
      name: config.name || 'ai-agent',
      redact: config.redact || [],
    }

    if (resolvePretty(config.pretty)) {
      options.transport = {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    }

    this.logger = pino(options)
  }

  info(message: string, context?: LogContext): void {
    if (context) {
      this.logger.info(context, message)
    }
    else {
      this.logger.info(message)
    }
  }

  error(message: string, error?: Error | LogContext, context?: LogContext): void {
    if (error instanceof Error) {
      this.logger.error(
        {
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
          ...context,
        },
        message,
      )
    }
    else if (error) {
      this.logger.error({ ...error, ...context }, message)
    }
    else {
      this.logger.error(message)
    }
  }

  warn(message: string, context?: LogContext): void {
    if (context) {
      this.logger.warn(context, message)
    }
    else {
      this.logger.warn(message)
    }
  }

  debug(message: string, context?: LogContext): void {
    if (context) {
      this.logger.debug(context, message)
    }
    else {
      this.logger.debug(message)
    }
  }

  trace(message: string, context?: LogContext): void {
    if (context) {
      this.logger.trace(context, message)
    }
    else {
      this.logger.trace(message)
    }
  }

  child(context: LogContext): Logger {
    return new Logger(this.logger.child(context))
  }

  setLevel(level: Level): void {
    this.logger.level = level
  }
}

// 惰性单例，避免 import 即触发 pino-pretty transport 启动
let _defaultLogger: Logger | null = null
function getDefaultLogger(): Logger {
  if (!_defaultLogger)
    _defaultLogger = new Logger()
  return _defaultLogger
}

export { getDefaultLogger, Logger }
