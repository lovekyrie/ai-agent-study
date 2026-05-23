import type { CodeChunk, SearchResult } from './indexer.js'

// Interface for vector store operations
interface VectorStoreAdapter {
  add: (vectors: { id: string, content: string, metadata: Record<string, unknown> }[]) => Promise<void>
  search: (query: string, options?: { topK?: number, filter?: Record<string, unknown> }) => Promise<{ id: string, content: string, score: number, metadata: Record<string, unknown> }[]>
  deleteByFilter: (filter: Record<string, unknown>) => Promise<void>
}

export interface RetrievalConfig {
  topK: number
  minScore: number
  rerank: boolean
  maxContextChunks: number
}

const DEFAULT_CONFIG: RetrievalConfig = {
  topK: 5,
  minScore: 0.5,
  rerank: false,
  maxContextChunks: 10,
}

export class CodeRetriever {
  private vectorStore: VectorStoreAdapter
  private config: RetrievalConfig

  constructor(vectorStore: VectorStoreAdapter, config?: Partial<RetrievalConfig>) {
    this.vectorStore = vectorStore
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async storeChunks(chunks: CodeChunk[], projectId: string): Promise<void> {
    const vectors = chunks.map(chunk => ({
      id: chunk.id,
      content: chunk.content,
      metadata: {
        projectId,
        file: chunk.location.file,
        type: chunk.type,
        language: chunk.language,
        symbol: chunk.symbol,
        startLine: chunk.metadata.startLine,
        endLine: chunk.metadata.endLine,
      },
    }))

    await this.vectorStore.add(vectors)
  }

  async search(query: string, projectId?: string, filters?: Record<string, unknown>): Promise<SearchResult[]> {
    const searchFilters: Record<string, unknown> = { ...filters }
    if (projectId) {
      searchFilters.projectId = projectId
    }

    const results = await this.vectorStore.search(query, {
      topK: this.config.topK * 2,
      filter: Object.keys(searchFilters).length > 0 ? searchFilters : undefined,
    })

    let searchResults: SearchResult[] = results
      .filter((r: { score: number }) => r.score >= this.config.minScore)
      .slice(0, this.config.topK)
      .map((r: { id: string, content: string, score: number, metadata: Record<string, unknown> }) => this.toSearchResult(r))

    if (this.config.rerank && searchResults.length > 1) {
      searchResults = await this.rerank(query, searchResults)
    }

    return searchResults.slice(0, this.config.maxContextChunks)
  }

  private toSearchResult(result: { id: string, content: string, score: number, metadata: Record<string, unknown> }): SearchResult {
    const chunk: CodeChunk = {
      id: result.id,
      content: result.content,
      location: {
        file: result.metadata.file as string,
        line: result.metadata.startLine as number,
      },
      type: result.metadata.type as CodeChunk['type'],
      language: result.metadata.language as string,
      symbol: result.metadata.symbol as string | undefined,
      metadata: {
        startLine: result.metadata.startLine as number,
        endLine: result.metadata.endLine as number,
        size: result.content.length,
      },
    }

    return {
      chunk,
      score: result.score,
      highlights: this.extractHighlights(result.content),
      context: this.buildContext(chunk),
    }
  }

  private extractHighlights(content: string): string[] {
    const highlights: string[] = []
    const lines = content.split('\n').slice(0, 20)

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('#') && trimmed.length > 10) {
        highlights.push(trimmed.slice(0, 200))
      }
    }

    return highlights.slice(0, 5)
  }

  private buildContext(chunk: CodeChunk): string {
    const location = chunk.location.line
      ? `${chunk.location.file}:${chunk.location.line}`
      : chunk.location.file

    let context = `\`\`\`${chunk.language}\n`
    context += `// ${chunk.type}${chunk.symbol ? `: ${chunk.symbol}` : ''} @ ${location}\n`
    context += chunk.content.slice(0, 2000)
    if (chunk.content.length > 2000)
      context += '\n// ... (truncated)'
    context += '\n```'

    return context
  }

  private async rerank(query: string, results: SearchResult[]): Promise<SearchResult[]> {
    const queryTerms = query.toLowerCase().split(/\s+/)

    return results
      .map((r) => {
        const content = r.chunk.content.toLowerCase()
        const termMatches = queryTerms.filter(term => content.includes(term)).length
        const symbolBonus = r.chunk.symbol && query.toLowerCase().includes(r.chunk.symbol.toLowerCase()) ? 0.2 : 0
        return {
          ...r,
          score: r.score + (termMatches * 0.05) + symbolBonus,
        }
      })
      .sort((a, b) => b.score - a.score)
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.vectorStore.deleteByFilter({ projectId })
  }

  async getStats(projectId: string): Promise<{ totalChunks: number, filesIndexed: number }> {
    const results = await this.vectorStore.search('', {
      topK: 10000,
      filter: { projectId },
    })

    const files = new Set(results.map(r => r.metadata.file as string))
    return {
      totalChunks: results.length,
      filesIndexed: files.size,
    }
  }
}

// In-memory vector store implementation (fallback)
export class InMemoryVectorStore implements VectorStoreAdapter {
  private vectors = new Map<string, { content: string, metadata: Record<string, unknown>, embedding?: number[] }>()

  async add(vectors: { id: string, content: string, metadata: Record<string, unknown> }[]): Promise<void> {
    for (const v of vectors) {
      this.vectors.set(v.id, {
        content: v.content,
        metadata: v.metadata,
        embedding: this.simpleEmbedding(v.content),
      })
    }
  }

  async search(query: string, options?: { topK?: number, filter?: Record<string, unknown> }): Promise<{ id: string, content: string, score: number, metadata: Record<string, unknown> }[]> {
    const queryEmbedding = this.simpleEmbedding(query)
    const topK = options?.topK || 5

    const results: { id: string, content: string, score: number, metadata: Record<string, unknown> }[] = []

    for (const [id, vec] of this.vectors) {
      if (options?.filter) {
        let matches = true
        for (const [key, value] of Object.entries(options.filter)) {
          if (vec.metadata[key] !== value) {
            matches = false
            break
          }
        }
        if (!matches)
          continue
      }

      const score = this.cosineSimilarity(queryEmbedding, vec.embedding || [0])
      results.push({
        id,
        content: vec.content,
        score,
        metadata: vec.metadata,
      })
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topK)
  }

  async deleteByFilter(filter: Record<string, unknown>): Promise<void> {
    const toDelete: string[] = []

    for (const [id, vec] of this.vectors) {
      let matches = true
      for (const [key, value] of Object.entries(filter)) {
        if (vec.metadata[key] !== value) {
          matches = false
          break
        }
      }
      if (matches)
        toDelete.push(id)
    }

    for (const id of toDelete) {
      this.vectors.delete(id)
    }
  }

  private simpleEmbedding(text: string): number[] {
    const embedding = Array.from({ length: 128 }).fill(0) as number[]
    const words = text.toLowerCase().split(/\s+/)

    for (let i = 0; i < words.length; i++) {
      const word = words[i]
      for (let j = 0; j < word.length && j < 128; j++) {
        embedding[(i + j) % 128] += word.charCodeAt(j)
      }
    }

    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0))
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= norm
      }
    }

    return embedding
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length)
      return 0

    let dot = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    const norm = Math.sqrt(normA) * Math.sqrt(normB)
    return norm > 0 ? dot / norm : 0
  }
}
