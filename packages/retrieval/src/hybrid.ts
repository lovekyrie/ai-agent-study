import type { DocumentChunk, HybridSearchOptions, RetrievalCandidate, VectorSearchFn } from './types.js'
import { tokenize } from './utils.js'

export class InMemoryLexicalIndex {
  private chunks: DocumentChunk[] = []
  private termFreqs = new Map<string, Map<string, number>>()
  private docLengths = new Map<string, number>()
  private documentFrequency = new Map<string, number>()

  add(chunks: DocumentChunk[]): void {
    for (const chunk of chunks) {
      this.chunks = this.chunks.filter((existing) => existing.id !== chunk.id)
      this.chunks.push(chunk)
    }
    this.rebuild()
  }

  search(query: string, topK = 5): RetrievalCandidate[] {
    const terms = tokenize(query)
    if (terms.length === 0) return []

    const avgDocLength = this.averageDocLength()
    const scores = this.chunks.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      source: chunk.source,
      metadata: chunk.metadata,
      score: this.bm25(chunk.id, terms, avgDocLength),
    }))

    return scores
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((candidate, index) => ({ ...candidate, rank: index + 1 }))
  }

  private rebuild(): void {
    this.termFreqs.clear()
    this.docLengths.clear()
    this.documentFrequency.clear()

    for (const chunk of this.chunks) {
      const tokens = tokenize(chunk.content)
      this.docLengths.set(chunk.id, tokens.length)
      const freqs = new Map<string, number>()
      for (const token of tokens) freqs.set(token, (freqs.get(token) ?? 0) + 1)
      this.termFreqs.set(chunk.id, freqs)
      for (const term of new Set(tokens)) {
        this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1)
      }
    }
  }

  private averageDocLength(): number {
    if (this.docLengths.size === 0) return 1
    return Array.from(this.docLengths.values()).reduce((sum, length) => sum + length, 0) / this.docLengths.size
  }

  private bm25(id: string, terms: string[], avgDocLength: number): number {
    const k1 = 1.5
    const b = 0.75
    const freqs = this.termFreqs.get(id)
    if (!freqs) return 0
    const docLength = this.docLengths.get(id) ?? 0
    const totalDocs = Math.max(1, this.chunks.length)

    return terms.reduce((score, term) => {
      const tf = freqs.get(term) ?? 0
      if (tf === 0) return score
      const df = this.documentFrequency.get(term) ?? 0
      const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5))
      const numerator = tf * (k1 + 1)
      const denominator = tf + k1 * (1 - b + b * (docLength / avgDocLength))
      return score + idf * (numerator / denominator)
    }, 0)
  }
}

export function reciprocalRankFusion(
  resultLists: RetrievalCandidate[][],
  topK = 5,
  k = 60
): RetrievalCandidate[] {
  const byId = new Map<string, RetrievalCandidate>()
  const scores = new Map<string, number>()

  for (const list of resultLists) {
    list.forEach((candidate, index) => {
      byId.set(candidate.id, candidate)
      scores.set(candidate.id, (scores.get(candidate.id) ?? 0) + 1 / (k + index + 1))
    })
  }

  return Array.from(byId.values())
    .map((candidate) => ({ ...candidate, score: scores.get(candidate.id) ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }))
}

export function weightedFusion(
  vectorResults: RetrievalCandidate[],
  lexicalResults: RetrievalCandidate[],
  options?: HybridSearchOptions
): RetrievalCandidate[] {
  const vectorWeight = options?.vectorWeight ?? 0.65
  const lexicalWeight = options?.lexicalWeight ?? 0.35
  const topK = options?.topK ?? 5
  const merged = new Map<string, RetrievalCandidate>()

  for (const result of vectorResults) {
    merged.set(result.id, { ...result, score: normalize(result.score, vectorResults) * vectorWeight })
  }
  for (const result of lexicalResults) {
    const existing = merged.get(result.id)
    const lexicalScore = normalize(result.score, lexicalResults) * lexicalWeight
    merged.set(result.id, existing ? { ...existing, score: existing.score + lexicalScore } : { ...result, score: lexicalScore })
  }

  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }))
}

export class HybridRetriever {
  constructor(
    private readonly vectorSearch: VectorSearchFn,
    private readonly lexicalIndex: InMemoryLexicalIndex
  ) {}

  async search(query: string, options?: HybridSearchOptions & { strategy?: 'weighted' | 'rrf' }): Promise<RetrievalCandidate[]> {
    const topK = options?.topK ?? 5
    const vectorResults = await this.vectorSearch(query, topK * 2)
    const lexicalResults = this.lexicalIndex.search(query, topK * 2)
    if (options?.strategy === 'rrf') {
      return reciprocalRankFusion([vectorResults, lexicalResults], topK, options.rrfK)
    }
    return weightedFusion(vectorResults, lexicalResults, { ...options, topK })
  }
}

function normalize(score: number, list: RetrievalCandidate[]): number {
  if (list.length === 0) return 0
  const values = list.map((item) => item.score)
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) return score > 0 ? 1 : 0
  return (score - min) / (max - min)
}
