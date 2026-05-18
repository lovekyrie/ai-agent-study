import { AsyncLocalStorage } from 'async_hooks'

// Session context for tracking user sessions
export interface SessionData {
  id: string
  userId: string
  conversationHistory: Message[]
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: Date
  toolCalls?: ToolCall[]
}

export interface ToolCall {
  id: string
  tool: string
  params: Record<string, unknown>
  result?: unknown
}

// In-memory session store (use Redis/PostgreSQL in production)
const sessionStore = new Map<string, SessionData>()
const userSessions = new Map<string, Set<string>>() // userId -> sessionIds

export class SessionManager {
  private maxHistoryLength: number

  constructor(maxHistoryLength: number = 100) {
    this.maxHistoryLength = maxHistoryLength
  }

  createSession(userId: string): SessionData {
    const session: SessionData = {
      id: crypto.randomUUID(),
      userId,
      conversationHistory: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    sessionStore.set(session.id, session)

    if (!userSessions.has(userId)) {
      userSessions.set(userId, new Set())
    }
    userSessions.get(userId)!.add(session.id)

    return session
  }

  getSession(sessionId: string): SessionData | undefined {
    const session = sessionStore.get(sessionId)
    if (session) {
      session.updatedAt = new Date()
    }
    return session
  }

  getUserSessions(userId: string): SessionData[] {
    const sessionIds = userSessions.get(userId)
    if (!sessionIds) return []

    return Array.from(sessionIds)
      .map(id => sessionStore.get(id))
      .filter((s): s is SessionData => s !== undefined)
  }

  addMessage(sessionId: string, message: Omit<Message, 'id' | 'timestamp'>): Message | null {
    const session = sessionStore.get(sessionId)
    if (!session) return null

    const newMessage: Message = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    }

    session.conversationHistory.push(newMessage)
    session.updatedAt = new Date()

    // Trim history if needed
    if (session.conversationHistory.length > this.maxHistoryLength) {
      session.conversationHistory = session.conversationHistory.slice(-this.maxHistoryLength)
    }

    return newMessage
  }

  getHistory(sessionId: string, limit?: number): Message[] {
    const session = sessionStore.get(sessionId)
    if (!session) return []

    if (limit) {
      return session.conversationHistory.slice(-limit)
    }
    return [...session.conversationHistory]
  }

  updateMetadata(sessionId: string, metadata: Record<string, unknown>): boolean {
    const session = sessionStore.get(sessionId)
    if (!session) return false

    session.metadata = { ...session.metadata, ...metadata }
    session.updatedAt = new Date()
    return true
  }

  deleteSession(sessionId: string): boolean {
    const session = sessionStore.get(sessionId)
    if (!session) return false

    sessionStore.delete(sessionId)

    const userSessionIds = userSessions.get(session.userId)
    if (userSessionIds) {
      userSessionIds.delete(sessionId)
      if (userSessionIds.size === 0) {
        userSessions.delete(session.userId)
      }
    }

    return true
  }

  cleanExpiredSessions(maxAgeMs: number): number {
    const now = Date.now()
    let cleaned = 0

    for (const [id, session] of sessionStore.entries()) {
      if (now - session.updatedAt.getTime() > maxAgeMs) {
        this.deleteSession(id)
        cleaned++
      }
    }

    return cleaned
  }

  count(): number {
    return sessionStore.size
  }
}

// Async local storage for request context propagation
export const requestContextStorage = new AsyncLocalStorage<RequestContext>()

export interface RequestContext {
  requestId: string
  sessionId?: string
  userId?: string
  startTime: number
  metadata: Record<string, unknown>
}

export function getCurrentContext(): RequestContext | undefined {
  return requestContextStorage.getStore()
}

export function runWithContext<T>(
  context: RequestContext,
  fn: () => T
): T {
  return requestContextStorage.run(context, fn)
}

// Durable execution checkpoint
export interface WorkflowCheckpoint {
  id: string
  workflowId: string
  stepName: string
  state: Record<string, unknown>
  createdAt: Date
  completed: boolean
}

const checkpoints = new Map<string, WorkflowCheckpoint[]>()

export class CheckpointManager {
  saveCheckpoint(workflowId: string, stepName: string, state: Record<string, unknown>): WorkflowCheckpoint {
    const checkpoint: WorkflowCheckpoint = {
      id: crypto.randomUUID(),
      workflowId,
      stepName,
      state: { ...state },
      createdAt: new Date(),
      completed: false,
    }

    if (!checkpoints.has(workflowId)) {
      checkpoints.set(workflowId, [])
    }
    checkpoints.get(workflowId)!.push(checkpoint)

    return checkpoint
  }

  getLatestCheckpoint(workflowId: string): WorkflowCheckpoint | undefined {
    const workflowCheckpoints = checkpoints.get(workflowId)
    if (!workflowCheckpoints || workflowCheckpoints.length === 0) {
      return undefined
    }
    return workflowCheckpoints[workflowCheckpoints.length - 1]
  }

  markCompleted(workflowId: string, checkpointId: string): boolean {
    const workflowCheckpoints = checkpoints.get(workflowId)
    if (!workflowCheckpoints) return false

    const checkpoint = workflowCheckpoints.find(c => c.id === checkpointId)
    if (!checkpoint) return false

    checkpoint.completed = true
    return true
  }

  getHistory(workflowId: string): WorkflowCheckpoint[] {
    return checkpoints.get(workflowId) || []
  }

  clearHistory(workflowId: string): void {
    checkpoints.delete(workflowId)
  }
}

import crypto from 'crypto'