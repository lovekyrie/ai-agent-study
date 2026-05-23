import { describe, expect, it, vi } from 'vitest'
import { AuthService, JobQueue } from '../src/index.js'

describe('stage11 production primitives', () => {
  it('generates tokens that can be verified', () => {
    const auth = new AuthService('test-secret')
    const token = auth.generateToken('user-1')

    expect(auth.verifyToken(token.token)).toEqual({ userId: 'user-1', valid: true })
  })

  it('hashes passwords with salt', () => {
    const auth = new AuthService('test-secret')
    const hashA = auth.hashPassword('password-123')
    const hashB = auth.hashPassword('password-123')

    expect(hashA).not.toBe(hashB)
    expect(auth.verifyPassword('password-123', hashA)).toBe(true)
    expect(auth.verifyPassword('wrong', hashA)).toBe(false)
  })

  it('processes delayed jobs even when no pending job exists', async () => {
    vi.useFakeTimers()
    const queue = new JobQueue<string>('test-queue')
    const processed: string[] = []

    await queue.process(async (job) => {
      processed.push(job.data)
      return job.data
    })
    await queue.add('delayed', 'payload', { delay: 500 })

    await vi.advanceTimersByTimeAsync(700)

    expect(processed).toEqual(['payload'])
    queue.close()
    vi.useRealTimers()
  })
})
