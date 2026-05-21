import type { AgentStreamEvent } from '@ai-agent-study/server'
import { collectEventStream } from '@ai-agent-study/server'

export async function* runStreamingAgent(runId: string, query: string): AsyncIterable<AgentStreamEvent> {
  yield { type: 'retrieval', runId, query, hits: 1, sources: ['demo.md'] }
  yield { type: 'tool_call', runId, name: 'search_docs', arguments: { query }, status: 'completed', result: { hits: 1 } }
  for (const delta of ['Agent ', 'runtime ', 'ready.']) {
    yield { type: 'token', runId, delta }
  }
  yield { type: 'final', runId, content: 'Agent runtime ready.', metadata: { sources: ['demo.md'] } }
}

export async function renderStreamingResponse(runId: string, query: string): Promise<string> {
  return collectEventStream(runStreamingAgent(runId, query))
}
