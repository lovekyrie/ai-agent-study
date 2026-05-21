import type { AgentStreamEvent } from './types.js'

export function encodeSSE(event: AgentStreamEvent, eventId?: string): string {
  const lines = [
    eventId ? `id: ${eventId}` : undefined,
    `event: ${event.type}`,
    `data: ${JSON.stringify(event)}`,
    '',
    '',
  ].filter(line => line !== undefined)
  return lines.join('\n')
}

export async function* encodeEventStream(events: AsyncIterable<AgentStreamEvent> | Iterable<AgentStreamEvent>) {
  let id = 0
  for await (const event of events) {
    yield encodeSSE(event, String(++id))
  }
}

export async function collectEventStream(events: AsyncIterable<AgentStreamEvent> | Iterable<AgentStreamEvent>): Promise<string> {
  const chunks: string[] = []
  for await (const chunk of encodeEventStream(events)) chunks.push(chunk)
  return chunks.join('')
}
