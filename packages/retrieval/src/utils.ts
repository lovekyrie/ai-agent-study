import type { MetadataValue } from './types.js'
import { createHash } from 'node:crypto'

export function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

export function normalizeWhitespace(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim()
}

export function mergeMetadata(
  left?: Record<string, MetadataValue>,
  right?: Record<string, MetadataValue>,
): Record<string, MetadataValue> {
  return { ...(left ?? {}), ...(right ?? {}) }
}

export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1)
}
