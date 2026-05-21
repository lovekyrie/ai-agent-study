import { AgenticRAGGraph } from './index.js'

const graph = new AgenticRAGGraph({
  retrieve: async (query) => query.includes('detailed')
    ? [{ id: '1', source: 'rag.md', content: 'Agentic RAG rewrites weak queries.', score: 0.9 }]
    : [],
})

console.log(await graph.run('agentic rag'))
