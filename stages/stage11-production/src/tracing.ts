import { AsyncLocalStorage } from 'node:async_hooks'

// OpenTelemetry-style tracing interfaces (simplified)
export interface Span {
  id: string
  name: string
  startTime: number
  endTime?: number
  duration?: number
  attributes: Record<string, unknown>
  status: 'ok' | 'error'
  error?: string
  children: Span[]
  parentId?: string
  traceId?: string
}

export interface Trace {
  id: string
  spans: Span[]
  startTime: number
  endTime?: number
  duration?: number
}

// In-memory trace store (use proper OTLP exporter in production)
const activeTraces = new Map<string, Trace>()
const traceHistory: Trace[] = []
const MAX_HISTORY = 1000

// Async local storage for span context
const spanStorage = new AsyncLocalStorage<Span>()
const traceStorage = new AsyncLocalStorage<Trace>()

export class TracingService {
  private serviceName: string
  private lastTraceId?: string

  constructor(serviceName: string = 'ai-agent-study') {
    this.serviceName = serviceName
  }

  startTrace(name: string, _attributes: Record<string, unknown> = {}): Trace {
    const trace: Trace = {
      id: this.generateId('trace'),
      spans: [],
      startTime: Date.now(),
    }

    activeTraces.set(trace.id, trace)
    this.lastTraceId = trace.id
    return trace
  }

  startSpan(
    name: string,
    attributes: Record<string, unknown> = {},
    parentSpan?: Span,
  ): Span {
    const parent = parentSpan ?? spanStorage.getStore()
    const trace = traceStorage.getStore() ?? (this.lastTraceId ? activeTraces.get(this.lastTraceId) : undefined)
    const span: Span = {
      id: this.generateId('span'),
      name,
      startTime: Date.now(),
      attributes,
      status: 'ok',
      children: [],
      parentId: parent?.id,
      traceId: parent?.traceId ?? trace?.id,
    }

    if (parent) {
      parent.children.push(span)
    }
    else {
      trace?.spans.push(span)
    }

    return span
  }

  endSpan(span: Span, status: 'ok' | 'error' = 'ok', errorMessage?: string): void {
    span.endTime = Date.now()
    span.duration = span.endTime - span.startTime
    span.status = status

    if (status === 'error' && errorMessage) {
      span.error = errorMessage
    }
  }

  recordSpan<T>(
    name: string,
    attributes: Record<string, unknown>,
    fn: (span: Span) => T,
  ): T {
    const span = this.startSpan(name, attributes)
    try {
      const result = spanStorage.run(span, () => fn(span))
      this.endSpan(span, 'ok')
      return result
    }
    catch (error) {
      this.endSpan(span, 'error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  runInTrace<T>(trace: Trace, fn: () => T): T {
    return traceStorage.run(trace, fn)
  }

  async runInTraceAsync<T>(trace: Trace, fn: () => Promise<T>): Promise<T> {
    return traceStorage.run(trace, fn)
  }

  async recordSpanAsync<T>(
    name: string,
    attributes: Record<string, unknown>,
    fn: (span: Span) => Promise<T>,
  ): Promise<T> {
    const span = this.startSpan(name, attributes)

    try {
      const result = await spanStorage.run(span, () => fn(span))
      this.endSpan(span, 'ok')
      return result
    }
    catch (error) {
      this.endSpan(span, 'error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  endTrace(traceId: string): Trace | undefined {
    const trace = activeTraces.get(traceId)
    if (!trace)
      return undefined

    trace.endTime = Date.now()
    trace.duration = trace.endTime - trace.startTime

    activeTraces.delete(traceId)

    // Add to history
    traceHistory.push(trace)
    if (traceHistory.length > MAX_HISTORY) {
      traceHistory.shift()
    }

    return trace
  }

  getActiveTrace(traceId: string): Trace | undefined {
    return activeTraces.get(traceId)
  }

  getTraceHistory(): Trace[] {
    return [...traceHistory]
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  }
}

// Span context helper
export function getCurrentSpan(): Span | undefined {
  return spanStorage.getStore()
}

export function getCurrentTraceId(): string | undefined {
  const span = getCurrentSpan()
  return span?.traceId
}

// Create a new tracing service instance
export const tracing = new TracingService()

// Metrics collector
export interface Metric {
  name: string
  value: number
  timestamp: number
  tags: Record<string, string>
}

const metrics: Metric[] = []
const METRIC_HISTORY = 10000

export class MetricsCollector {
  record(name: string, value: number, tags: Record<string, string> = {}): void {
    metrics.push({
      name,
      value,
      timestamp: Date.now(),
      tags,
    })

    if (metrics.length > METRIC_HISTORY) {
      metrics.shift()
    }
  }

  increment(name: string, tags: Record<string, string> = {}): void {
    this.record(name, 1, tags)
  }

  gauge(name: string, value: number, tags: Record<string, string> = {}): void {
    this.record(name, value, tags)
  }

  timing(name: string, durationMs: number, tags: Record<string, string> = {}): void {
    this.record(name, durationMs, { ...tags, type: 'timing' })
  }

  get(name?: string, since?: number): Metric[] {
    let result = metrics

    if (since) {
      result = result.filter(m => m.timestamp >= since)
    }

    if (name) {
      result = result.filter(m => m.name === name)
    }

    return result
  }

  summarize(name: string, windowMs?: number): {
    count: number
    sum: number
    avg: number
    min: number
    max: number
  } {
    const since = windowMs ? Date.now() - windowMs : 0
    const relevant = metrics.filter(m => m.name === name && m.timestamp >= since)

    if (relevant.length === 0) {
      return { count: 0, sum: 0, avg: 0, min: 0, max: 0 }
    }

    const values = relevant.map(m => m.value)
    return {
      count: values.length,
      sum: values.reduce((a, b) => a + b, 0),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    }
  }
}

export const metricsCollector = new MetricsCollector()
