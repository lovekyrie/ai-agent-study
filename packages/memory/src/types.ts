export interface MemoryEntry {
  id: string
  content: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  timestamp: number
  importance?: number // 0-1, higher means more important
  metadata?: Record<string, unknown>
}

export interface MemoryConfig {
  maxShortTermEntries: number
  longTermEnabled: boolean
  importanceThreshold: number
}
