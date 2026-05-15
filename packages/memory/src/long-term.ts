import type { MemoryEntry } from './types.js'

export interface LongTermStore {
  add(entry: MemoryEntry): Promise<void>
  search(query: string, topK?: number): Promise<MemoryEntry[]>
  delete(id: string): Promise<boolean>
  clear(): Promise<void>
}

/**
 * In-memory implementation for development/testing.
 * Replace with vector DB in production.
 */
export class InMemoryLongTerm implements LongTermStore {
  private entries: MemoryEntry[] = []

  async add(entry: MemoryEntry): Promise<void> {
    // Avoid duplicates
    const exists = this.entries.find((e) => e.id === entry.id)
    if (!exists) {
      this.entries.push(entry)
    }
  }

  async search(query: string, topK: number = 10): Promise<MemoryEntry[]> {
    const q = query.toLowerCase()
    const scored = this.entries.map((entry) => {
      const content = (entry.content || '').toLowerCase()
      let score = 0
      if (content.includes(q)) {
        score = 1.0
      } else {
        const words = q.split(/\s+/)
        for (const word of words) {
          if (content.includes(word)) score += 0.3
        }
      }
      score += (entry.importance ?? 0) * 0.5
      return { entry, score }
    })

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => s.entry)
  }

  async delete(id: string): Promise<boolean> {
    const index = this.entries.findIndex((e) => e.id === id)
    if (index === -1) return false
    this.entries.splice(index, 1)
    return true
  }

  async clear(): Promise<void> {
    this.entries = []
  }
}