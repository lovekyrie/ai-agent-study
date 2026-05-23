import type { CodeChunk, Reference, SearchResult, Source } from './indexer.js'
import type { CodeRetriever } from './retrieval.js'
import { EventEmitter } from 'node:events'
import { createLLMClient } from '@ai-agent-study/llm-client'
import { CodeIndexer } from './indexer.js'

export interface AgentConfig {
  model?: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}

const DEFAULT_CONFIG: AgentConfig = {
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt: `You are an expert AI assistant that helps users understand and navigate codebases.
You can answer questions about code structure, find specific functions/classes, explain code logic, and suggest modifications.
When answering:
1. Always cite the specific file and line numbers from the source code
2. Provide clear, concise explanations
3. Include relevant code snippets when helpful
4. If you're unsure about something, say so rather than guessing`,
}

export interface QuestionResult {
  answer: string
  sources: Source[]
  references: Reference[]
  metadata: {
    tokensUsed: number
    latencyMs: number
    model: string
    chunksRetrieved: number
  }
}

export class CodebaseAgent extends EventEmitter {
  private indexer: CodeIndexer
  private retriever: CodeRetriever
  private llm: ReturnType<typeof createLLMClient>
  private config: Required<AgentConfig>
  private projectChunks: Map<string, CodeChunk[]> = new Map()

  constructor(
    retriever: CodeRetriever,
    config?: AgentConfig,
  ) {
    super()
    this.indexer = new CodeIndexer()
    this.retriever = retriever
    this.llm = createLLMClient()
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<AgentConfig>
  }

  async indexProject(projectPath: string, name: string): Promise<{ projectId: string, stats: { filesIndexed: number, symbolsExtracted: number } }> {
    const project = await this.indexer.indexProject(projectPath, name)

    // Store chunks for later use
    const chunks = await this.getAllChunks(projectPath)
    this.projectChunks.set(project.id, chunks)

    // Store in vector store
    await this.retriever.storeChunks(chunks, project.id)

    this.emit('project-indexed', {
      projectId: project.id,
      filesIndexed: project.filesIndexed,
      symbolsExtracted: project.symbolsExtracted,
    })

    return {
      projectId: project.id,
      stats: {
        filesIndexed: project.filesIndexed,
        symbolsExtracted: project.symbolsExtracted,
      },
    }
  }

  private async getAllChunks(_projectPath: string): Promise<CodeChunk[]> {
    // This is a simplified version - in production, the indexer would return chunks directly
    // For now, we'll create a basic retriever that can work with the stored chunks
    return [] // Chunks are stored in vector store directly by indexer
  }

  async ask(question: string, projectId: string): Promise<QuestionResult> {
    const startTime = Date.now()

    this.emit('question-received', { question, projectId })

    // Search for relevant code
    const searchResults = await this.retriever.search(question, projectId)
    this.emit('chunks-retrieved', { count: searchResults.length })

    if (searchResults.length === 0) {
      return {
        answer: 'I could not find any relevant code in the indexed codebase to answer your question. You may need to index the project first or try a different question.',
        sources: [],
        references: [],
        metadata: {
          tokensUsed: 0,
          latencyMs: Date.now() - startTime,
          model: this.config.model,
          chunksRetrieved: 0,
        },
      }
    }

    // Build context from search results
    const context = this.buildContext(searchResults)

    // Generate answer using LLM
    const prompt = this.buildPrompt(question, context)
    const response = await this.llm.chat([
      { role: 'system', content: this.config.systemPrompt },
      { role: 'user', content: prompt },
    ])

    // Parse response
    const answer = response.content
    const tokensUsed = this.estimateTokens(prompt) + this.estimateTokens(answer)

    // Build sources and references
    const sources = this.buildSources(searchResults)
    const references = this.buildReferences(searchResults)

    this.emit('answer-generated', {
      tokensUsed,
      latencyMs: Date.now() - startTime,
      chunksUsed: searchResults.length,
    })

    return {
      answer,
      sources,
      references,
      metadata: {
        tokensUsed,
        latencyMs: Date.now() - startTime,
        model: this.config.model,
        chunksRetrieved: searchResults.length,
      },
    }
  }

  private buildContext(results: SearchResult[]): string {
    let context = '# Relevant Code Context\n\n'

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      context += `## [${i + 1}] ${result.chunk.type}: ${result.chunk.symbol || result.chunk.location.file}\n`
      context += `File: ${result.chunk.location.file}`
      if (result.chunk.location.line) {
        context += `:${result.chunk.location.line}`
      }
      context += '\n'
      context += `Relevance: ${(result.score * 100).toFixed(0)}%\n\n`
      context += `\`\`\`${result.chunk.language}\n`
      context += result.chunk.content.slice(0, 1500)
      if (result.chunk.content.length > 1500) {
        context += '\n// ... (content truncated)'
      }
      context += '\n```\n\n'
    }

    return context
  }

  private buildPrompt(question: string, context: string): string {
    return `## Question
${question}

${context}

## Instructions
Based on the code context above, answer the question. Cite specific file names and line numbers when referencing code.
If the context doesn't contain enough information to fully answer the question, say so.`
  }

  private buildSources(results: SearchResult[]): Source[] {
    const seen = new Set<string>()
    const sources: Source[] = []

    for (const result of results) {
      const file = result.chunk.location.file
      if (seen.has(file))
        continue
      seen.add(file)

      sources.push({
        chunkId: result.chunk.id,
        file,
        lines: result.highlights.slice(0, 3).join('\n'),
        relevance: result.score,
      })
    }

    return sources
  }

  private buildReferences(results: SearchResult[]): Reference[] {
    const refs: Reference[] = []

    for (const result of results) {
      const chunk = result.chunk
      if (!chunk.symbol && !chunk.location.line)
        continue

      refs.push({
        file: chunk.location.file,
        line: chunk.location.line || chunk.metadata.startLine,
        symbol: chunk.symbol,
        snippet: chunk.content.slice(0, 200).trim(),
      })
    }

    return refs.slice(0, 10)
  }

  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English
    return Math.ceil(text.length / 4)
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.retriever.deleteProject(projectId)
    this.projectChunks.delete(projectId)
    this.emit('project-deleted', { projectId })
  }

  async getStats(projectId: string): Promise<{ totalChunks: number, filesIndexed: number }> {
    return this.retriever.getStats(projectId)
  }
}

// Simple in-memory project store
export class ProjectStore {
  private projects = new Map<string, {
    id: string
    name: string
    path: string
    createdAt: Date
    stats: { filesIndexed: number, symbolsExtracted: number }
  }>()

  create(id: string, name: string, path: string, stats: { filesIndexed: number, symbolsExtracted: number }): void {
    this.projects.set(id, {
      id,
      name,
      path,
      createdAt: new Date(),
      stats,
    })
  }

  get(id: string) {
    return this.projects.get(id)
  }

  list() {
    return Array.from(this.projects.values())
  }

  delete(id: string): boolean {
    return this.projects.delete(id)
  }
}
