import type { RetrievalCandidate } from '@ai-agent-study/retrieval'

export interface AgenticRAGState {
  query: string
  plannedQuery: string
  attempts: number
  maxAttempts: number
  retrieved: RetrievalCandidate[]
  answer?: string
  steps: Array<{ node: string, note: string }>
}

export interface AgenticRAGGraphOptions {
  retrieve: (query: string) => Promise<RetrievalCandidate[]>
  grade?: (query: string, results: RetrievalCandidate[]) => Promise<boolean>
  rewrite?: (query: string, attempt: number) => Promise<string>
  answer?: (query: string, results: RetrievalCandidate[]) => Promise<string>
  maxAttempts?: number
}

export class AgenticRAGGraph {
  constructor(private readonly options: AgenticRAGGraphOptions) {}

  async run(query: string): Promise<AgenticRAGState> {
    const state: AgenticRAGState = {
      query,
      plannedQuery: query,
      attempts: 0,
      maxAttempts: this.options.maxAttempts ?? 2,
      retrieved: [],
      steps: [],
    }

    state.steps.push({ node: 'plan', note: `planned query: ${state.plannedQuery}` })

    while (state.attempts < state.maxAttempts) {
      state.attempts++
      state.retrieved = await this.options.retrieve(state.plannedQuery)
      state.steps.push({ node: 'retrieve', note: `attempt ${state.attempts}, hits ${state.retrieved.length}` })

      const relevant = await (this.options.grade?.(state.query, state.retrieved) ?? Promise.resolve(state.retrieved.length > 0))
      state.steps.push({ node: 'grade', note: relevant ? 'relevant' : 'rewrite required' })
      if (relevant)
        break

      state.plannedQuery = await (this.options.rewrite?.(state.plannedQuery, state.attempts) ?? Promise.resolve(`${state.query} detailed explanation`))
      state.steps.push({ node: 'rewrite', note: state.plannedQuery })
    }

    state.answer = await (this.options.answer?.(state.query, state.retrieved) ?? Promise.resolve(defaultAnswer(state.query, state.retrieved)))
    state.steps.push({ node: 'answer', note: state.answer })
    return state
  }
}

function defaultAnswer(query: string, results: RetrievalCandidate[]): string {
  if (results.length === 0)
    return `No context found for: ${query}`
  const sources = results.map(result => result.source).join(', ')
  return `Answer for "${query}" using sources: ${sources}`
}
