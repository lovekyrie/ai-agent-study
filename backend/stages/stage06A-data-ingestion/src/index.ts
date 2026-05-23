import type { SourceDocument } from '@ai-agent-study/retrieval'
import { ingestDocuments, MemoryDocumentLoader } from '@ai-agent-study/retrieval'

export async function buildIngestionPreview(documents: SourceDocument[]) {
  const loader = new MemoryDocumentLoader(documents)
  const loaded = await loader.load()
  const result = await ingestDocuments(loaded, { maxChars: 500, overlapChars: 80, dedupe: true })
  return {
    documentCount: result.documents.length,
    chunkCount: result.chunks.length,
    duplicatesRemoved: result.duplicatesRemoved,
    chunks: result.chunks,
  }
}
