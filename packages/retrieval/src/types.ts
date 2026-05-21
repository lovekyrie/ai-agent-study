export type MetadataValue = string | number | boolean

export interface SourceDocument {
  id?: string
  source: string
  content: string
  mimeType?: string
  metadata?: Record<string, MetadataValue>
}

export interface LineRange {
  startLine: number
  endLine: number
}

export interface DocumentChunk {
  id: string
  source: string
  content: string
  index: number
  hash: string
  metadata: Record<string, MetadataValue>
  loc?: LineRange
}

export interface ChunkOptions {
  maxChars?: number
  overlapChars?: number
}

export interface IngestionResult {
  documents: SourceDocument[]
  chunks: DocumentChunk[]
  duplicatesRemoved: number
}

export interface Loader {
  load(): Promise<SourceDocument[]>
}

export type Splitter = (document: SourceDocument, options?: ChunkOptions) => DocumentChunk[]

export interface RetrievalCandidate {
  id: string
  content: string
  source: string
  score: number
  metadata?: Record<string, MetadataValue>
  rank?: number
}

export interface HybridSearchOptions {
  topK?: number
  vectorWeight?: number
  lexicalWeight?: number
  rrfK?: number
}

export type VectorSearchFn = (query: string, topK: number) => Promise<RetrievalCandidate[]>
