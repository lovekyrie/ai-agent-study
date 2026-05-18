import { describe, it, expect } from 'vitest'
import { chunkText, chunkCode, chunkByFile } from '../src/chunking.js'

describe('chunkText', () => {
  it('returns empty for empty input', () => {
    expect(chunkText('', 'src.txt')).toEqual([])
  })

  it('returns a single chunk when text fits in one chunk', () => {
    const chunks = chunkText('hello world', 'src.txt', { chunkSize: 100 })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('hello world')
    expect(chunks[0].metadata.startLine).toBe(1)
    expect(chunks[0].metadata.endLine).toBe(1)
  })

  it('computes startLine/endLine correctly across multi-line text', () => {
    const text = [
      'line1',
      'line2',
      'line3',
      '',
      'line5',
      'line6',
    ].join('\n')
    const chunks = chunkText(text, 'src.txt', { chunkSize: 20, chunkOverlap: 0, minChunkSize: 1 })
    // 第一块应当从第 1 行开始，最后一块应当覆盖到最后一行
    expect(chunks[0].metadata.startLine).toBe(1)
    expect(chunks[chunks.length - 1].metadata.endLine).toBeGreaterThanOrEqual(5)
  })

  it('rejects invalid options', () => {
    expect(() => chunkText('a', 's', { chunkSize: 0 })).toThrow(/chunkSize/)
    expect(() => chunkText('a', 's', { chunkSize: 10, chunkOverlap: 10 })).toThrow(/chunkOverlap/)
    expect(() => chunkText('a', 's', { chunkOverlap: -1 })).toThrow(/chunkOverlap/)
  })

  it('does not loop infinitely with edge-case parameters', () => {
    // chunkSize 比 minChunkSize 小一点，强制循环但 nextStart 保证递增
    const text = 'x'.repeat(500)
    const chunks = chunkText(text, 's', { chunkSize: 50, chunkOverlap: 49, minChunkSize: 1 })
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.length).toBeLessThan(1000) // sanity bound
  })

  it('produces chunks with content not exceeding chunkSize (approximately)', () => {
    const text = 'a '.repeat(500) // 1000 字符
    const chunks = chunkText(text, 's', { chunkSize: 100, chunkOverlap: 20, minChunkSize: 10 })
    for (const c of chunks) {
      expect(c.content.length).toBeLessThanOrEqual(120) // 留一些边界宽容
    }
  })
})

describe('chunkCode', () => {
  it('splits code into line-based chunks', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `const x${i} = ${i}`).join('\n')
    const chunks = chunkCode(lines, 'app.ts', 'ts', { chunkSize: 20, chunkOverlap: 5, minChunkSize: 1 })
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks[0].metadata.startLine).toBe(1)
    expect(chunks[0].metadata.fileType).toBe('ts')
  })

  it('rejects chunkOverlap >= chunkSize', () => {
    expect(() => chunkCode('a\nb', 's', 'ts', { chunkSize: 5, chunkOverlap: 5 })).toThrow()
  })

  it('skips trailing empty fragment', () => {
    const code = 'a\nb\nc'
    const chunks = chunkCode(code, 's', 'ts', { chunkSize: 5, chunkOverlap: 1, minChunkSize: 1 })
    expect(chunks.length).toBe(1)
  })
})

describe('chunkByFile', () => {
  it('selects chunkCode for source file extensions', () => {
    const chunks = chunkByFile('x\ny\nz', 's.ts', 'ts')
    expect(chunks[0].metadata.fileType).toBe('ts')
  })

  it('selects chunkText for non-code files', () => {
    const chunks = chunkByFile('hello world', 'README.md', 'md')
    expect(chunks[0].metadata.fileType).toBeUndefined()
  })
})
