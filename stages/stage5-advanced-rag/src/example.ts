import { getConfig } from '@ai-agent-study/config'
import { Logger } from '@ai-agent-study/logger'
import { AdvancedRAG, Embedder, chunkText, type Chunk } from './index.js'

async function runSection(logger: Logger, name: string, fn: () => Promise<void>) {
  logger.info(`\n========== ${name} ==========`)
  try {
    await fn()
  } catch (error) {
    logger.error(`Section "${name}" failed`, error instanceof Error ? error : undefined)
  }
}

async function main() {
  const config = getConfig()
  const logger = new Logger({ name: 'stage5-example', level: config.app.logLevel })

  // 没有 API key 时自动走 stub 嵌入，避免直接崩；同时打印警告
  const embedder = new Embedder()
  if (embedder.getProvider() === 'stub') {
    logger.warn(
      'Embedder running in STUB mode (no semantic similarity). Set OPENAI_API_KEY for real embeddings.'
    )
  }

  const rag = new AdvancedRAG({ embedder, defaultTopK: 5, rerankTopK: 3 })

  const documents = [
    {
      content: `TypeScript Generics Tutorial

Generics allow you to create reusable components that work with multiple types.
Use angle brackets <T> to define a generic type parameter.

function identity<T>(arg: T): T { return arg }
const result = identity<string>("hello")`,
      source: 'generics.txt',
    },
    {
      content: `TypeScript Interface vs Type

Both interface and type are used to describe object shapes.
Interface is more extensible and can be implemented by classes.

interface User { name: string; age: number }
type Point = { x: number; y: number }`,
      source: 'interfaces.txt',
    },
    {
      content: `Rust Ownership and Borrowing

Rust uses ownership rules to manage memory safely without garbage collection.
Each value has a single owner; when the owner goes out of scope, the value is dropped.

let s1 = String::from("hello")
let s2 = s1  // s1 is moved to s2`,
      source: 'rust.txt',
    },
  ]

  await runSection(logger, '1. Chunk & Index', async () => {
    const allChunks: Chunk[] = []
    for (const doc of documents) {
      allChunks.push(...chunkText(doc.content, doc.source, { chunkSize: 200, chunkOverlap: 30 }))
    }
    logger.info(`Created ${allChunks.length} chunks`)
    await rag.index(allChunks)
  })

  const query = 'How do generics work in TypeScript?'

  await runSection(logger, '2. Retrieval (no rerank, no rewrite)', async () => {
    const result = await rag.retrieve(query, { useRerank: false, useRewrite: false })
    for (let i = 0; i < result.chunks.length; i++) {
      console.log(`[${i + 1}] score=${result.scores[i].toFixed(3)}`)
      console.log(`    ${result.chunks[i].content.slice(0, 80)}...`)
    }
  })

  await runSection(logger, '3. Retrieval with rewrite + rerank', async () => {
    const result = await rag.retrieve(query, { useRerank: true, useRewrite: true })
    for (let i = 0; i < result.chunks.length; i++) {
      console.log(`[${i + 1}] score=${result.scores[i].toFixed(3)}`)
      console.log(`    ${result.chunks[i].content.slice(0, 80)}...`)
    }
  })

  await runSection(logger, '4. Query Rewriter', async () => {
    const variants = await rag.getQueryRewriter().expand(query)
    console.log('Query variants:')
    variants.forEach((v, i) => console.log(`  [${i}] ${v}`))
  })

  logger.info('\nStage 5 completed')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
