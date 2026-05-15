export interface VectorDocument {
  id: string
  content: string
  metadata?: Record<string, string | number | boolean>
  embedding?: number[]
}

export interface SearchResult {
  document: VectorDocument
  score: number
}

export interface SearchOptions {
  topK?: number
  filter?: Record<string, string | number | boolean>
  minScore?: number
}

export interface CollectionStats {
  name: string
  count: number
}

export interface ICollection {
  add(documents: VectorDocument[]): Promise<void>
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>
  delete(ids: string[]): Promise<void>
  update(id: string, document: Partial<VectorDocument>): Promise<void>
  stats(): Promise<CollectionStats>
}
