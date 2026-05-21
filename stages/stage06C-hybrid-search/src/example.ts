import { MemoryDocumentLoader, ingestDocuments } from '@ai-agent-study/retrieval'
import { compareHybridStrategies } from './index.js'

const docs = await new MemoryDocumentLoader([
  { source: 'vector.md', content: 'Vector search finds semantically similar chunks.' },
  { source: 'bm25.md', content: 'BM25 ranks documents using term frequency and inverse document frequency.' },
]).load()
const { chunks } = await ingestDocuments(docs)
const vectorResults = chunks.map((chunk, index) => ({
  id: chunk.id,
  source: chunk.source,
  content: chunk.content,
  score: index === 0 ? 0.9 : 0.4,
}))

console.log(await compareHybridStrategies(chunks, vectorResults, 'BM25 semantic search'))
