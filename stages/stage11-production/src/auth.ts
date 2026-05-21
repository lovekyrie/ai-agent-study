import crypto from 'node:crypto'

// Simple in-memory session store (use Redis in production)
const sessions = new Map<string, Session>()
const authTokens = new Map<string, AuthToken>()

export interface Session {
  id: string
  userId: string
  createdAt: Date
  lastAccessedAt: Date
  data: Record<string, unknown>
}

export interface AuthToken {
  token: string
  userId: string
  expiresAt: Date
}

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours

export class AuthService {
  private secretKey: string

  constructor(secretKey: string = process.env.JWT_SECRET || 'default-secret') {
    this.secretKey = secretKey
  }

  generateToken(userId: string): AuthToken {
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS)

    const authToken = { token, userId, expiresAt }
    authTokens.set(token, authToken)
    return authToken
  }

  verifyToken(token: string): { userId: string, valid: boolean } {
    const authToken = authTokens.get(token)
    if (!authToken) {
      return { userId: '', valid: false }
    }

    if (authToken.expiresAt > new Date()) {
      return { userId: authToken.userId, valid: true }
    }

    authTokens.delete(token)
    return { userId: '', valid: false }
  }

  createSession(userId: string, initialData: Record<string, unknown> = {}): Session {
    const token = crypto.randomBytes(32).toString('hex')
    const session: Session = {
      id: token,
      userId,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      data: initialData,
    }
    sessions.set(token, session)
    return session
  }

  getSession(token: string): Session | undefined {
    const session = sessions.get(token)
    if (session) {
      session.lastAccessedAt = new Date()
    }
    return session
  }

  deleteSession(token: string): boolean {
    return sessions.delete(token)
  }

  hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex')
    const iterations = 120_000
    const hash = crypto.pbkdf2Sync(password, salt + this.secretKey, iterations, 32, 'sha256').toString('hex')
    return `pbkdf2$${iterations}$${salt}$${hash}`
  }

  verifyPassword(password: string, hash: string): boolean {
    const parts = hash.split('$')
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
      const legacy = crypto.createHash('sha256').update(password + this.secretKey).digest('hex')
      return legacy.length === hash.length && crypto.timingSafeEqual(Buffer.from(legacy), Buffer.from(hash))
    }
    const iterations = Number(parts[1])
    const salt = parts[2]
    const expected = Buffer.from(parts[3], 'hex')
    const actual = crypto.pbkdf2Sync(password, salt + this.secretKey, iterations, expected.length, 'sha256')
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  }
}

// Simple rate limiter using sliding window
export class RateLimiter {
  private requests = new Map<string, number[]>()
  private windowMs: number
  private maxRequests: number

  constructor(windowMs: number = 60000, maxRequests: number = 100) {
    this.windowMs = windowMs
    this.maxRequests = maxRequests
  }

  check(identifier: string): { allowed: boolean, remaining: number, resetAt: number } {
    const now = Date.now()
    const windowStart = now - this.windowMs

    if (!this.requests.has(identifier)) {
      this.requests.set(identifier, [])
    }

    const userRequests = this.requests.get(identifier)!.filter(t => t > windowStart)
    this.requests.set(identifier, userRequests)

    if (userRequests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...userRequests)
      return {
        allowed: false,
        remaining: 0,
        resetAt: oldestRequest + this.windowMs,
      }
    }

    userRequests.push(now)
    return {
      allowed: true,
      remaining: this.maxRequests - userRequests.length,
      resetAt: now + this.windowMs,
    }
  }

  reset(identifier: string): void {
    this.requests.delete(identifier)
  }
}

// Cache with TTL support
export class CacheService {
  private cache = new Map<string, { value: unknown, expiresAt: number }>()

  set(key: string, value: unknown, ttlMs: number = 300000): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    })
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry)
      return undefined

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return undefined
    }

    return entry.value as T
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
      }
    }
  }
}

// Request context for tracing
export interface RequestContext {
  requestId: string
  userId?: string
  timestamp: Date
  metadata: Record<string, unknown>
}

let contextCounter = 0

export function createRequestContext(userId?: string): RequestContext {
  return {
    requestId: `${Date.now()}-${++contextCounter}`,
    userId,
    timestamp: new Date(),
    metadata: {},
  }
}

export interface User {
  id: string
  email: string
  passwordHash: string
  createdAt: Date
  role: 'user' | 'admin'
}

export class UserService {
  private users = new Map<string, User>()

  async createUser(email: string, password: string, role: 'user' | 'admin' = 'user'): Promise<User> {
    if (this.users.has(email)) {
      throw new Error('User already exists')
    }

    const auth = new AuthService()
    const user: User = {
      id: crypto.randomUUID(),
      email,
      passwordHash: auth.hashPassword(password),
      createdAt: new Date(),
      role,
    }

    this.users.set(email, user)
    return user
  }

  async authenticate(email: string, password: string): Promise<User | null> {
    const user = this.users.get(email)
    if (!user)
      return null

    const auth = new AuthService()
    if (!auth.verifyPassword(password, user.passwordHash)) {
      return null
    }

    return user
  }

  getUserById(id: string): User | undefined {
    for (const user of this.users.values()) {
      if (user.id === id)
        return user
    }
    return undefined
  }
}
