import type { CollectionStats, ICollection, SearchOptions, SearchResult, VectorDocument } from './types.js'

/**
 * In-memory vector store for development/testing.
 * Replace with Chroma/Qdrant in production.
 */
export class InMemoryCollection implements ICollection {
  private documents: VectorDocument[] = []
  private name: string

  constructor(name: string = 'default') {
    this.name = name
  }

  async add(documents: VectorDocument[]): Promise<void> {
    for (const doc of documents) {
      const exists = this.documents.find(d => d.id === doc.id)
      if (exists) {
        exists.content = doc.content
        exists.metadata = doc.metadata
        exists.embedding = doc.embedding
      }
      else {
        this.documents.push({ ...doc })
      }
    }
  }

  async search(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    const { topK = 5, filter, minScore = 0 } = options ?? {}

    let candidates = this.documents

    // Apply metadata filter
    if (filter) {
      candidates = candidates.filter((doc) => {
        if (!doc.metadata)
          return false
        return Object.entries(filter).every(
          ([key, value]) => doc.metadata?.[key] === value,
        )
      })
    }

    const queryLower = query.toLowerCase()

    // Simple keyword scoring (no embeddings in memory mode)
    const scored = candidates.map((doc) => {
      const content = doc.content.toLowerCase()
      let score = 0
      if (content.includes(queryLower)) {
        score = 1.0
      }
      else {
        const queryWords = queryLower.split(/\s+/)
        for (const word of queryWords) {
          if (word.length > 1 && content.includes(word)) {
            score += 0.3
          }
        }
      }
      return { document: doc, score: Math.min(score, 1.0) }
    })

    return scored
      .filter(r => r.score > 0 && r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  async delete(ids: string[]): Promise<void> {
    this.documents = this.documents.filter(d => !ids.includes(d.id))
  }

  async update(
    id: string,
    update: Partial<VectorDocument>,
  ): Promise<void> {
    const doc = this.documents.find(d => d.id === id)
    if (!doc)
      throw new Error(`Document ${id} not found`)
    if (update.content !== undefined)
      doc.content = update.content
    if (update.metadata !== undefined)
      doc.metadata = update.metadata
    if (update.embedding !== undefined)
      doc.embedding = update.embedding
  }

  async stats(): Promise<CollectionStats> {
    return { name: this.name, count: this.documents.length }
  }
}
