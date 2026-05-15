import { randomUUID } from 'node:crypto'
import type { MemoryEntry } from './types.js'

function generateId(): string {
  return `mem_${randomUUID()}`
}

export class ShortTermMemory {
  // 用 Map 而非 Array：O(1) get/delete，且 Map 自身保留插入顺序
  private entries: Map<string, MemoryEntry> = new Map()
  private readonly maxEntries: number

  constructor(maxEntries: number = 50) {
    if (maxEntries <= 0) throw new Error('maxEntries must be positive')
    this.maxEntries = maxEntries
  }

  add(
    content: string,
    role: MemoryEntry['role'] = 'user',
    metadata?: Record<string, unknown>
  ): MemoryEntry {
    const entry: MemoryEntry = {
      id: generateId(),
      content,
      role,
      timestamp: Date.now(),
      importance: 0,
      metadata,
    }
    this.entries.set(entry.id, entry)
    this.trim()
    return entry
  }

  get(id: string): MemoryEntry | undefined {
    return this.entries.get(id)
  }

  getAll(): MemoryEntry[] {
    return Array.from(this.entries.values())
  }

  getRecent(n: number): MemoryEntry[] {
    return this.getAll().slice(-n)
  }

  update(
    id: string,
    updates: Partial<Pick<MemoryEntry, 'content' | 'importance' | 'metadata'>>
  ): boolean {
    const entry = this.entries.get(id)
    if (!entry) return false
    if (updates.content !== undefined) entry.content = updates.content
    if (updates.importance !== undefined) entry.importance = updates.importance
    if (updates.metadata !== undefined) {
      entry.metadata = { ...entry.metadata, ...updates.metadata }
    }
    return true
  }

  delete(id: string): boolean {
    return this.entries.delete(id)
  }

  clear(): void {
    this.entries.clear()
  }

  size(): number {
    return this.entries.size
  }

  getImportant(n: number, threshold = 0.5): MemoryEntry[] {
    return this.getAll()
      .filter((e) => (e.importance ?? 0) >= threshold)
      .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
      .slice(0, n)
  }

  /**
   * 容量超限时裁剪：保留 importance 高的 + 时间最近的。
   * 策略：从全集移除「不重要 且 不在最近 30% 时间窗内」的条目，直到 size <= maxEntries。
   */
  private trim(): void {
    if (this.entries.size <= this.maxEntries) return

    const all = this.getAll()
    const recentCount = Math.max(1, Math.ceil(this.maxEntries * 0.3))
    // 按时间倒序取最近 N 个 ID（真正的"最近"，不是按 importance）
    const recentIds = new Set(
      [...all].sort((a, b) => b.timestamp - a.timestamp).slice(0, recentCount).map((e) => e.id)
    )

    // 候选：所有非 recent 的，按 importance 降序，保留 (max - recent) 个
    const importantPool = all
      .filter((e) => !recentIds.has(e.id))
      .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
      .slice(0, this.maxEntries - recentCount)

    const keep = new Set<string>([...recentIds, ...importantPool.map((e) => e.id)])

    // 重建 Map，保持原始插入顺序（按 timestamp 升序）
    const next = new Map<string, MemoryEntry>()
    for (const entry of all.sort((a, b) => a.timestamp - b.timestamp)) {
      if (keep.has(entry.id)) next.set(entry.id, entry)
    }
    this.entries = next
  }
}
