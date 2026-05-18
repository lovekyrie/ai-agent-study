import { randomUUID } from 'node:crypto'

export interface ChunkOptions {
  chunkSize: number
  chunkOverlap: number
  minChunkSize: number
}

export interface Chunk {
  id: string
  content: string
  metadata: {
    source: string
    startLine: number
    endLine: number
    fileType?: string
    [key: string]: unknown
  }
}

function newChunkId(): string {
  return `chunk_${randomUUID()}`
}

function validateOptions(opts: ChunkOptions, unit: 'char' | 'line'): void {
  if (opts.chunkSize <= 0) throw new Error(`chunkSize must be positive (${unit})`)
  if (opts.chunkOverlap < 0) throw new Error(`chunkOverlap must be >= 0 (${unit})`)
  if (opts.chunkOverlap >= opts.chunkSize) {
    throw new Error(`chunkOverlap (${opts.chunkOverlap}) must be < chunkSize (${opts.chunkSize})`)
  }
  if (opts.minChunkSize < 0) throw new Error(`minChunkSize must be >= 0`)
}

/** 计算 0-based 字符偏移对应的 1-based 行号 */
function lineNumberAt(text: string, offset: number): number {
  if (offset <= 0) return 1
  let count = 1
  const upto = Math.min(offset, text.length)
  for (let i = 0; i < upto; i++) {
    if (text[i] === '\n') count++
  }
  return count
}

/**
 * 文本分块：尽量在段落/句子边界处切。
 * 参数：chunkSize/chunkOverlap/minChunkSize 单位都是**字符**。
 */
export function chunkText(
  text: string,
  source: string,
  options: Partial<ChunkOptions> = {}
): Chunk[] {
  const chunkSize = options.chunkSize ?? 1000
  const opts: ChunkOptions = {
    chunkSize,
    // 默认 overlap = chunkSize / 10，避免用户只传 chunkSize 时与固定默认值冲突
    chunkOverlap: options.chunkOverlap ?? Math.max(1, Math.floor(chunkSize / 10)),
    minChunkSize: options.minChunkSize ?? Math.min(50, Math.max(1, Math.floor(chunkSize / 4))),
  }
  validateOptions(opts, 'char')

  if (text.length === 0) return []
  if (text.length <= opts.chunkSize) {
    return [
      {
        id: newChunkId(),
        content: text,
        metadata: { source, startLine: 1, endLine: lineNumberAt(text, text.length) },
      },
    ]
  }

  const chunks: Chunk[] = []
  let start = 0
  let safetyGuard = 0
  const maxIterations = Math.ceil(text.length / Math.max(1, opts.chunkSize - opts.chunkOverlap)) + 4

  while (start < text.length) {
    if (++safetyGuard > maxIterations) {
      throw new Error('chunkText: too many iterations, possible infinite loop')
    }

    let end = Math.min(start + opts.chunkSize, text.length)

    // 尝试在段落或空白处切
    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf('\n\n', end)
      if (paragraphBreak > start + opts.minChunkSize) {
        end = paragraphBreak + 2
      } else {
        const spaceBreak = text.lastIndexOf(' ', end)
        if (spaceBreak > start + opts.minChunkSize) end = spaceBreak + 1
      }
    }

    const slice = text.slice(start, end)
    const trimmed = slice.replace(/^\s+|\s+$/g, '')
    if (trimmed.length >= opts.minChunkSize) {
      const leadingWhitespace = slice.length - slice.replace(/^\s+/, '').length
      const contentStartOffset = start + leadingWhitespace
      const contentEndOffset = start + slice.length - (slice.length - slice.replace(/\s+$/, '').length)
      chunks.push({
        id: newChunkId(),
        content: trimmed,
        metadata: {
          source,
          startLine: lineNumberAt(text, contentStartOffset),
          endLine: lineNumberAt(text, contentEndOffset - 1),
        },
      })
    }

    // 到达末尾直接结束，避免在 end == text.length 时陷入"每次只前进 1 字符"的慢循环
    if (end >= text.length) break
    // 字符级 overlap，单位一致，且保证 nextStart > start 防死循环
    const nextStart = Math.max(start + 1, end - opts.chunkOverlap)
    if (nextStart >= text.length) break
    start = nextStart
  }

  return chunks
}

/**
 * 代码分块：按行切（chunkSize 单位为行数）。
 */
export function chunkCode(
  code: string,
  source: string,
  language: string,
  options: Partial<ChunkOptions> = {}
): Chunk[] {
  const opts: ChunkOptions = {
    chunkSize: options.chunkSize ?? 30,
    chunkOverlap: options.chunkOverlap ?? 5,
    minChunkSize: options.minChunkSize ?? 3,
  }
  validateOptions(opts, 'line')

  const lines = code.split('\n')
  if (lines.length === 0) return []

  const chunks: Chunk[] = []
  let startLine = 1
  const stride = opts.chunkSize - opts.chunkOverlap // 必定 > 0（validate 保证）

  while (startLine <= lines.length) {
    const endLine = Math.min(startLine + opts.chunkSize - 1, lines.length)
    const content = lines.slice(startLine - 1, endLine).join('\n').trimEnd()

    // 至少 minChunkSize 行（非空内容）才入选
    const nonEmptyLineCount = content.split('\n').filter((l) => l.trim()).length
    if (nonEmptyLineCount >= opts.minChunkSize) {
      chunks.push({
        id: newChunkId(),
        content,
        metadata: { source, startLine, endLine, fileType: language },
      })
    }

    if (endLine >= lines.length) break
    startLine += stride
  }

  return chunks
}

export function chunkByFile(content: string, source: string, fileType: string): Chunk[] {
  return isCodeFile(fileType) ? chunkCode(content, source, fileType) : chunkText(content, source)
}

function isCodeFile(fileType: string): boolean {
  const codeExtensions = new Set([
    'ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'cpp', 'c', 'h',
    'cs', 'rb', 'php', 'swift', 'kt', 'scala', 'vue', 'svelte',
  ])
  return codeExtensions.has(fileType.toLowerCase())
}
