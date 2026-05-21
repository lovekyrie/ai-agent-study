import { buildIngestionPreview } from './index.js'

const preview = await buildIngestionPreview([
  { source: 'docs/rag.md', content: '# RAG\n\nRAG combines retrieval and generation.' },
  { source: 'src/agent.ts', content: 'export async function runAgent() {\n  return "done"\n}' },
])

console.log(JSON.stringify(preview, null, 2))
