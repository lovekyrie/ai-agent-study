import { describe, expect, it } from 'vitest'
import { buildIngestionPreview } from '../src/index.js'

describe('stage06A data ingestion', () => {
  it('builds traceable chunks with dedupe stats', async () => {
    const result = await buildIngestionPreview([
      { source: 'guide.md', content: '# Agent\n\nTools call APIs.' },
      { source: 'guide-copy.md', content: '# Agent\n\nTools call APIs.' },
    ])

    expect(result.documentCount).toBe(2)
    expect(result.chunkCount).toBe(1)
    expect(result.duplicatesRemoved).toBe(1)
    expect(result.chunks[0].hash).toHaveLength(16)
  })
})
