import type { DocumentChunk } from '@ai-agent-study/retrieval'
import type { VectorStoreAdapter } from '@ai-agent-study/vectorstore'

export async function indexChunks(store: VectorStoreAdapter, chunks: DocumentChunk[]) {
  await store.upsert(chunks.map(chunk => ({
    id: chunk.id,
    content: chunk.content,
    metadata: {
      ...chunk.metadata,
      source: chunk.source,
      chunkIndex: chunk.index,
      hash: chunk.hash,
    },
  })))
  return store.stats()
}

export async function rebuildSource(store: VectorStoreAdapter, source: string, chunks: DocumentChunk[]) {
  await store.deleteByFilter({ source })
  return indexChunks(store, chunks.filter(chunk => chunk.source === source))
}
