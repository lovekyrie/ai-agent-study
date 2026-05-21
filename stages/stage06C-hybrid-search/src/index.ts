import {
  HybridRetriever,
  InMemoryLexicalIndex,
  type DocumentChunk,
  type RetrievalCandidate,
} from '@ai-agent-study/retrieval'

export function createHybridRetriever(chunks: DocumentChunk[], vectorResults: RetrievalCandidate[]) {
  const lexical = new InMemoryLexicalIndex()
  lexical.add(chunks)
  const vectorSearch = async (_query: string, topK: number) => vectorResults.slice(0, topK)
  return new HybridRetriever(vectorSearch, lexical)
}

export async function compareHybridStrategies(chunks: DocumentChunk[], vectorResults: RetrievalCandidate[], query: string) {
  const retriever = createHybridRetriever(chunks, vectorResults)
  const weighted = await retriever.search(query, { topK: 5, strategy: 'weighted' })
  const rrf = await retriever.search(query, { topK: 5, strategy: 'rrf' })
  return { weighted, rrf }
}
