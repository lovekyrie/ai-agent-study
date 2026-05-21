import type { ChunkOptions, DocumentChunk, SourceDocument, Splitter } from './types.js'
import { mergeMetadata, stableHash } from './utils.js'

const DEFAULT_MAX_CHARS = 1200
const DEFAULT_OVERLAP_CHARS = 160

function validateOptions(options?: ChunkOptions): Required<ChunkOptions> {
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS
  const overlapChars = options?.overlapChars ?? DEFAULT_OVERLAP_CHARS
  if (maxChars <= 0) throw new Error('maxChars must be greater than 0')
  if (overlapChars < 0) throw new Error('overlapChars must be greater than or equal to 0')
  if (overlapChars >= maxChars) throw new Error('overlapChars must be smaller than maxChars')
  return { maxChars, overlapChars }
}

function createChunk(
  document: SourceDocument,
  content: string,
  index: number,
  metadata?: Record<string, string | number | boolean>,
  startLine?: number,
  endLine?: number
): DocumentChunk {
  const hash = stableHash(`${document.source}:${index}:${content}`)
  return {
    id: `${stableHash(document.source)}-${index}-${hash.slice(0, 8)}`,
    source: document.source,
    content,
    index,
    hash,
    metadata: mergeMetadata(document.metadata, metadata),
    loc: startLine && endLine ? { startLine, endLine } : undefined,
  }
}

export const splitByCharacters: Splitter = (document, options) => {
  const { maxChars, overlapChars } = validateOptions(options)
  const chunks: DocumentChunk[] = []
  let start = 0

  while (start < document.content.length) {
    const end = Math.min(start + maxChars, document.content.length)
    const content = document.content.slice(start, end).trim()
    if (content) {
      chunks.push(createChunk(document, content, chunks.length, { splitter: 'characters' }))
    }
    if (end === document.content.length) break
    start = end - overlapChars
  }

  return chunks
}

export const splitMarkdownByHeading: Splitter = (document, options) => {
  const sections = document.content
    .split(/(?=^#{1,6}\s+)/m)
    .map((section) => section.trim())
    .filter(Boolean)

  if (sections.length === 0) return splitByCharacters(document, options)

  const chunks: DocumentChunk[] = []
  for (const section of sections) {
    const heading = section.match(/^#{1,6}\s+(.+)$/m)?.[1] ?? 'untitled'
    const pseudoDoc = { ...document, content: section }
    const sectionChunks = splitByCharacters(pseudoDoc, options).map((chunk) => ({
      ...chunk,
      id: `${chunk.id}-${chunks.length}`,
      index: chunks.length + chunk.index,
      metadata: { ...chunk.metadata, splitter: 'markdown-heading', heading },
    }))
    chunks.push(...sectionChunks)
  }
  return chunks.map((chunk, index) => ({ ...chunk, index }))
}

export const splitCodeByLines: Splitter = (document, options) => {
  const { maxChars, overlapChars } = validateOptions(options)
  const lines = document.content.split('\n')
  const chunks: DocumentChunk[] = []
  let startLine = 0

  while (startLine < lines.length) {
    let endLine = startLine
    let size = 0
    while (endLine < lines.length && size + lines[endLine].length + 1 <= maxChars) {
      size += lines[endLine].length + 1
      endLine++
    }
    if (endLine === startLine) endLine++
    const content = lines.slice(startLine, endLine).join('\n').trim()
    if (content) {
      chunks.push(createChunk(
        document,
        content,
        chunks.length,
        { splitter: 'code-lines' },
        startLine + 1,
        endLine
      ))
    }
    if (endLine >= lines.length) break
    const overlapLines = Math.max(0, Math.ceil(overlapChars / Math.max(1, Math.floor(size / (endLine - startLine)))))
    startLine = Math.max(startLine + 1, endLine - overlapLines)
  }

  return chunks
}

export function chooseSplitter(source: string): Splitter {
  if (/\.(ts|tsx|js|jsx|py|java|go|rs)$/i.test(source)) return splitCodeByLines
  if (/\.(md|mdx)$/i.test(source)) return splitMarkdownByHeading
  return splitByCharacters
}

export async function ingestDocuments(
  documents: SourceDocument[],
  options?: ChunkOptions & { dedupe?: boolean }
) {
  const seen = new Set<string>()
  const chunks: DocumentChunk[] = []
  let duplicatesRemoved = 0

  for (const document of documents) {
    const splitter = chooseSplitter(document.source)
    for (const chunk of splitter(document, options)) {
      const fingerprint = stableHash(chunk.content)
      if (options?.dedupe !== false && seen.has(fingerprint)) {
        duplicatesRemoved++
        continue
      }
      seen.add(fingerprint)
      chunks.push(chunk)
    }
  }

  return { documents, chunks, duplicatesRemoved }
}
