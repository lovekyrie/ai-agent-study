import { EventEmitter } from 'node:events'

// Job states
export type JobState = 'pending' | 'active' | 'completed' | 'failed' | 'delayed'

// Job interface
export interface Job<T = unknown> {
  id: string
  name: string
  data: T
  state: JobState
  attempts: number
  maxAttempts: number
  createdAt: Date
  processedAt?: Date
  completedAt?: Date
  failedAt?: Date
  error?: string
  result?: unknown
  progress: number
}

// Queue options
export interface QueueOptions {
  concurrency?: number
  defaultJobOptions?: {
    attempts?: number
    backoff?: { type: 'exponential' | 'fixed', delay: number }
  }
}

// Queue event types
export type QueueEventType = 'completed' | 'failed' | 'progress' | 'active' | 'delayed'

// Simple in-memory queue (use BullMQ in production)
export class JobQueue<T = unknown> extends EventEmitter {
  private name: string
  private jobs = new Map<string, Job<T>>()
  private pending: string[] = []
  private active: string[] = []
  private completed: string[] = []
  private failed: string[] = []
  private delayed: Map<string, number>
  private concurrency: number
  private maxAttempts: number
  private defaultBackoff?: { type: 'exponential' | 'fixed', delay: number }
  private processor?: (job: Job<T>) => Promise<unknown>
  private processInterval?: NodeJS.Timeout

  constructor(name: string, options: QueueOptions = {}) {
    super()
    this.name = name
    this.concurrency = options.concurrency || 1
    this.maxAttempts = options.defaultJobOptions?.attempts || 3
    this.defaultBackoff = options.defaultJobOptions?.backoff
    this.delayed = new Map()

    // Start processing loop
    this.startProcessing()
  }

  async add(name: string, data: T, opts?: { delay?: number, attempts?: number }): Promise<Job<T>> {
    const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const job: Job<T> = {
      id,
      name,
      data,
      state: 'pending',
      attempts: 0,
      maxAttempts: opts?.attempts || this.maxAttempts,
      createdAt: new Date(),
      progress: 0,
    }

    this.jobs.set(id, job)

    if (opts?.delay && opts.delay > 0) {
      job.state = 'delayed'
      this.delayed.set(id, Date.now() + opts.delay)
    }
    else {
      this.pending.push(id)
    }

    this.emit('added', job)
    return job
  }

  async process(processor: (job: Job<T>) => Promise<unknown>): Promise<void> {
    this.processor = processor
  }

  private async processJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job || job.state === 'active')
      return

    job.state = 'active'
    job.processedAt = new Date()
    job.attempts++
    this.active.push(jobId)

    this.emit('active', job)

    try {
      if (!this.processor) {
        throw new Error('No processor registered')
      }

      const result = await this.processor(job)
      job.result = result
      job.state = 'completed'
      job.completedAt = new Date()
      job.progress = 100

      this.completed.push(jobId)
      this.active = this.active.filter(id => id !== jobId)

      this.emit('completed', job, result)
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      job.error = errorMessage

      if (job.attempts < job.maxAttempts) {
        // Schedule retry with backoff
        job.state = 'pending'
        const delay = this.calculateBackoff(job.attempts)
        this.delayed.set(jobId, Date.now() + delay)
        this.active = this.active.filter(id => id !== jobId)

        this.emit('delayed', job, delay)
      }
      else {
        job.state = 'failed'
        job.failedAt = new Date()
        this.failed.push(jobId)
        this.active = this.active.filter(id => id !== jobId)

        this.emit('failed', job, errorMessage)
      }
    }
  }

  private calculateBackoff(attempt: number): number {
    if (!this.defaultBackoff) {
      return Math.min(1000 * 2 ** attempt, 30000) // exponential, max 30s
    }

    if (this.defaultBackoff.type === 'fixed') {
      return this.defaultBackoff.delay
    }

    // exponential
    return Math.min(
      this.defaultBackoff.delay * 2 ** (attempt - 1),
      30000,
    )
  }

  private startProcessing(): void {
    this.processInterval = setInterval(() => {
      this.processNext()
    }, 100)
  }

  private async processNext(): Promise<void> {
    // Check delayed jobs
    const now = Date.now()
    for (const [jobId, runAt] of this.delayed.entries()) {
      if (runAt <= now) {
        this.delayed.delete(jobId)
        this.pending.push(jobId)
      }
    }

    while (this.active.length < this.concurrency && this.pending.length > 0) {
      const jobId = this.pending.shift()
      if (!jobId)
        return
      void this.processJob(jobId).catch((error) => {
        const job = this.jobs.get(jobId)
        if (job) {
          job.state = 'failed'
          job.error = error instanceof Error ? error.message : String(error)
          job.failedAt = new Date()
          this.failed.push(jobId)
          this.active = this.active.filter(id => id !== jobId)
          this.emit('failed', job, job.error)
        }
      })
    }
  }

  async getJob(jobId: string): Promise<Job<T> | undefined> {
    return this.jobs.get(jobId)
  }

  async getJobs(states?: JobState[]): Promise<Job<T>[]> {
    if (!states) {
      return Array.from(this.jobs.values())
    }

    return Array.from(this.jobs.values()).filter(job => states.includes(job.state))
  }

  async getCounts(): Promise<Record<JobState, number>> {
    const counts: Record<JobState, number> = {
      pending: this.pending.length,
      active: this.active.length,
      completed: this.completed.length,
      failed: this.failed.length,
      delayed: this.delayed.size,
    }
    return counts
  }

  async updateProgress(jobId: string, progress: number): Promise<void> {
    const job = this.jobs.get(jobId)
    if (job) {
      job.progress = Math.min(100, Math.max(0, progress))
      this.emit('progress', job, progress)
    }
  }

  async remove(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId)
    if (!job)
      return false

    this.pending = this.pending.filter(id => id !== jobId)
    this.active = this.active.filter(id => id !== jobId)
    this.completed = this.completed.filter(id => id !== jobId)
    this.failed = this.failed.filter(id => id !== jobId)
    this.delayed.delete(jobId)

    return this.jobs.delete(jobId)
  }

  async pause(): Promise<void> {
    if (this.processInterval) {
      clearInterval(this.processInterval)
      this.processInterval = undefined
    }
  }

  async resume(): Promise<void> {
    if (!this.processInterval) {
      this.startProcessing()
    }
  }

  async drain(): Promise<void> {
    await this.pause()
    this.pending = []
    this.delayed.clear()
  }

  close(): void {
    this.pause()
    this.jobs.clear()
    this.removeAllListeners()
  }
}

// Worker class for processing queue jobs
export class Worker<T = unknown> {
  private queue: JobQueue<T>
  private isRunning = false

  constructor(queue: JobQueue<T>) {
    this.queue = queue
  }

  async start(processor: (job: Job<T>) => Promise<unknown>): Promise<void> {
    this.isRunning = true
    await this.queue.process(processor)
  }

  async stop(): Promise<void> {
    this.isRunning = false
    await this.queue.pause()
  }
}
