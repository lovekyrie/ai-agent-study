import { CodeRetriever, InMemoryVectorStore } from './retrieval.js'

async function main() {
  console.log('=== Codebase Agent Demo ===\n')

  // Create in-memory vector store and retriever
  const vectorStore = new InMemoryVectorStore()
  const retriever = new CodeRetriever(vectorStore)

  console.log('Vector store and retriever created successfully')

  // Demo of what the system can do
  console.log(`
The Codebase Agent provides:

1. Code Indexing
   - Indexes codebases and extracts functions, classes, interfaces
   - Supports TypeScript, JavaScript, Python
   - Chunks code for efficient retrieval

2. Semantic Search
   - Vector-based similarity search
   - Configurable top-K and score threshold
   - Optional reranking

3. Q&A with Context
   - Uses retrieved code chunks as context
   - Generates answers with citations
   - Reports source references

Usage:

1. Index a project:
   const agent = new CodebaseAgent(retriever)
   const { projectId, stats } = await agent.indexProject('./my-project', 'My App')
   console.log('Indexed:', stats.filesIndexed, 'files')

2. Ask a question:
   const result = await agent.ask('How is authentication handled?', projectId)
   console.log('Answer:', result.answer)
   console.log('Sources:', result.sources)
   console.log('References:', result.references)

3. Get stats:
   const stats = await agent.getStats(projectId)
   console.log('Total chunks:', stats.totalChunks)

4. Delete project:
   await agent.deleteProject(projectId)
`)
}

main().catch(console.error)
