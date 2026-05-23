import { ingestDocuments, MemoryDocumentLoader } from '@ai-agent-study/retrieval'
import { InMemoryVectorStoreAdapter } from '@ai-agent-study/vectorstore'
import { indexChunks } from './index.js'

const documents = await new MemoryDocumentLoader([
  { source: 'rag.md', content: 'Chroma stores embeddings and metadata filters.' },
]).load()
const { chunks } = await ingestDocuments(documents)
const store = new InMemoryVectorStoreAdapter()
console.log(await indexChunks(store, chunks))
console.log(await store.search('Chroma metadata'))
