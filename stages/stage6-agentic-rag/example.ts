import { AgenticRAG, MultiKnowledgeRouter, HybridSearchEngine, type KnowledgeBase } from './src/index.js'
import type { SearchResult } from '@ai-agent-study/vectorstore'

// Mock knowledge base for demonstration
function createMockKB(name: string, docs: string[]): KnowledgeBase {
  return {
    name,
    description: `Knowledge base for ${name}`,
    async search(query: string, topK: number = 5): Promise<SearchResult[]> {
      // Simple keyword matching simulation
      const results: SearchResult[] = docs
        .filter(d => d.toLowerCase().includes(query.toLowerCase()))
        .slice(0, topK)
        .map((content, i) => ({
          id: `${name}-${i}`,
          score: 0.8 + Math.random() * 0.2,
          document: {
            id: `${name}-${i}`,
            content,
            metadata: { source: name, type: 'mock' },
          },
        }))
      return results
    },
    async filter(metadata: Record<string, string | number | boolean>): Promise<SearchResult[]> {
      return []
    },
  }
}

async function main() {
  const rag = new AgenticRAG()

  // Register knowledge bases
  rag.registerKnowledgeBase(createMockKB('TypeScript', [
    'TypeScript is a typed superset of JavaScript.',
    'TypeScript supports interfaces and generics.',
    'TypeScript compiles to plain JavaScript.',
    'TypeScript has strict mode.',
  ]))

  rag.registerKnowledgeBase(createMockKB('Rust', [
    'Rust is a systems programming language.',
    'Rust guarantees memory safety without garbage collection.',
    'Rust has ownership and borrowing rules.',
    'Rust can be used for web development with Actix.',
  ]))

  rag.registerKnowledgeBase(createMockKB('Python', [
    'Python is a high-level interpreted language.',
    'Python has dynamic typing.',
    'Python is widely used in data science.',
    'Python supports multiple programming paradigms.',
  ]))

  console.log('=== Agentic RAG Demo ===\n')

  // Test retrieval planning
  const query1 = 'How does TypeScript handle types?'
  console.log(`Query: "${query1}"`)
  console.log('\n--- Retrieval Plan ---')
  const plan1 = await rag['planRetrieval'](query1)
  console.log('Planned knowledge bases:', plan1.knowledgeBases)
  console.log('Reasoning:', plan1.reasoning)

  console.log('\n--- Research Agent ---')
  const response1 = await rag.runResearch('What is TypeScript?')
  console.log('Response:', response1.message.content.slice(0, 200), '...')
  console.log('Steps taken:', response1.steps.length)

  // Test multi-knowledge router
  console.log('\n=== Multi-Knowledge Router ===\n')
  const router = new MultiKnowledgeRouter()
  router.register(createMockKB('docs', ['Documentation content']))
  router.register(createMockKB('wiki', ['Wiki content']))
  router.register(createMockKB('api', ['API reference']))

  const route1 = await router.route('What is the API for authentication?')
  console.log('Primary KB:', route1.primary?.name)
  console.log('Secondary KBs:', route1.secondary.map(kb => kb.name))

  // Test hybrid search
  console.log('\n=== Hybrid Search ===\n')
  const vectorKB = createMockKB('vector', ['Vector search content about TypeScript'])
  const keywordKB = createMockKB('keyword', ['Keyword search about TypeScript types'])
  const hybrid = new HybridSearchEngine(vectorKB, keywordKB)

  const hybridResults = await hybrid.search('TypeScript', 5)
  console.log('Hybrid results count:', hybridResults.length)
  for (const r of hybridResults.slice(0, 2)) {
    console.log(`  - Score: ${r.score.toFixed(3)}, Source: ${r.document.metadata.source}`)
  }
}

main().catch(console.error)
