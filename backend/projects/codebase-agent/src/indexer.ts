import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'
import { glob } from 'glob'

// Types
export interface CodeLocation {
  file: string
  line?: number
  column?: number
}

export interface CodeChunk {
  id: string
  content: string
  location: CodeLocation
  symbol?: string
  type: 'function' | 'class' | 'interface' | 'type' | 'constant' | 'module' | 'file'
  language: string
  metadata: {
    startLine: number
    endLine: number
    size: number
    imports?: string[]
    exports?: string[]
  }
}

export interface IndexedProject {
  id: string
  name: string
  rootPath: string
  language: string
  filesIndexed: number
  symbolsExtracted: number
  indexedAt: Date
  config: IndexConfig
}

export interface IndexConfig {
  includePatterns: string[]
  excludePatterns: string[]
  maxFileSize: number
  chunkSize: number
  chunkOverlap: number
  extractSymbols: boolean
  languages: string[]
}

export interface SearchResult {
  chunk: CodeChunk
  score: number
  highlights: string[]
  context: string
}

export interface AskResult {
  answer: string
  sources: Source[]
  references: Reference[]
  metadata: {
    tokensUsed: number
    latencyMs: number
    model: string
  }
}

export interface Source {
  chunkId: string
  file: string
  lines: string
  relevance: number
}

export interface Reference {
  file: string
  line: number
  symbol?: string
  snippet: string
}

// Parse different code languages
const PARSERS: Record<string, (content: string, file: string) => CodeChunk[]> = {
  typescript: parseTypeScript,
  javascript: parseJavaScript,
  python: parsePython,
  default: parseGeneric,
}

export class CodeIndexer extends EventEmitter {
  private config: IndexConfig

  constructor(config?: Partial<IndexConfig>) {
    super()
    this.config = {
      includePatterns: ['**/*.{ts,tsx,js,jsx,py}'],
      excludePatterns: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
      maxFileSize: 1024 * 1024, // 1MB
      chunkSize: 1000,
      chunkOverlap: 200,
      extractSymbols: true,
      languages: ['typescript', 'javascript', 'python'],
      ...config,
    }
  }

  async indexProject(projectPath: string, name: string): Promise<IndexedProject> {
    const projectId = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const allChunks: CodeChunk[] = []

    this.emit('indexing-started', { projectId, projectPath })

    // Find all files
    const files = await this.findFiles(projectPath)
    this.emit('files-found', { projectId, count: files.length })

    // Process each file
    for (const file of files) {
      const chunks = await this.indexFile(file, projectPath)
      allChunks.push(...chunks)
      this.emit('file-indexed', { projectId, file, chunksCreated: chunks.length })
    }

    const project: IndexedProject = {
      id: projectId,
      name,
      rootPath: projectPath,
      language: this.detectPrimaryLanguage(files),
      filesIndexed: files.length,
      symbolsExtracted: allChunks.filter(c => c.symbol).length,
      indexedAt: new Date(),
      config: this.config,
    }

    this.emit('indexing-completed', { projectId, totalChunks: allChunks.length })
    return project
  }

  private async findFiles(projectPath: string): Promise<string[]> {
    const files: string[] = []

    for (const pattern of this.config.includePatterns) {
      const matches = await glob(pattern, {
        cwd: projectPath,
        ignore: this.config.excludePatterns,
        absolute: true,
      })
      files.push(...matches)
    }

    // Filter by size
    const filtered: string[] = []
    for (const file of files) {
      try {
        const stat = await fs.stat(file)
        if (stat.size <= this.config.maxFileSize) {
          filtered.push(file)
        }
      }
      catch {
        // Skip files we can't stat
      }
    }

    return filtered
  }

  private async indexFile(filePath: string, rootPath: string): Promise<CodeChunk[]> {
    const ext = path.extname(filePath).slice(1)
    const lang = this.mapExtensionToLanguage(ext)

    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const parser = PARSERS[lang] || PARSERS.default
      const chunks = parser(content, filePath)

      // Add relative path and language to each chunk
      return chunks.map(chunk => ({
        ...chunk,
        location: {
          ...chunk.location,
          file: path.relative(rootPath, filePath),
        },
        language: lang,
      }))
    }
    catch {
      return []
    }
  }

  private mapExtensionToLanguage(ext: string): string {
    const map: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      pyw: 'python',
    }
    return map[ext] || 'text'
  }

  private detectPrimaryLanguage(files: string[]): string {
    const extCounts: Record<string, number> = {}
    for (const file of files) {
      const ext = path.extname(file).slice(1)
      extCounts[ext] = (extCounts[ext] || 0) + 1
    }

    let maxExt = ''
    let maxCount = 0
    for (const [ext, count] of Object.entries(extCounts)) {
      if (count > maxCount) {
        maxCount = count
        maxExt = ext
      }
    }

    return this.mapExtensionToLanguage(maxExt)
  }
}

// TypeScript/JavaScript parser
function parseTypeScript(content: string, file: string): CodeChunk[] {
  const chunks: CodeChunk[] = []
  const lines = content.split('\n')

  // Simple regex-based parsing (in production, use a proper parser)
  const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(\w+)\s*[=:]\s*(?:async\s+)?(?:\([^)]*\)\s*=>|\([^)]*\)\s*:|function)/g
  const classRegex = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s[\w,\s]+)?/g
  const interfaceRegex = /(?:export\s+)?interface\s+(\w+)/g

  let match
  const processedRanges: [number, number][] = []

  // Find classes
  while ((match = classRegex.exec(content)) !== null) {
    const startLine = content.slice(0, match.index).split('\n').length
    const range = findBlockRange(content, match.index, '{', '}')
    if (range) {
      processedRanges.push(range)
      const chunkContent = content.slice(match.index, range[1])
      chunks.push({
        id: `chunk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        content: chunkContent,
        location: { file, line: startLine },
        symbol: match[1],
        type: 'class',
        language: 'typescript',
        metadata: {
          startLine,
          endLine: range[0],
          size: chunkContent.length,
        },
      })
    }
  }

  // Find functions
  functionRegex.lastIndex = 0
  while ((match = functionRegex.exec(content)) !== null) {
    const funcName = match[1] || match[2]
    if (!funcName || funcName === 'function')
      continue

    const startLine = content.slice(0, match.index).split('\n').length
    const range = findBlockRange(content, match.index, '{', '}')
    if (range) {
      const chunkContent = content.slice(match.index, range[1])
      chunks.push({
        id: `chunk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        content: chunkContent,
        location: { file, line: startLine },
        symbol: funcName,
        type: 'function',
        language: 'typescript',
        metadata: {
          startLine,
          endLine: range[0],
          size: chunkContent.length,
        },
      })
    }
  }

  // Find interfaces
  while ((match = interfaceRegex.exec(content)) !== null) {
    const startLine = content.slice(0, match.index).split('\n').length
    const endLine = findLineEnd(content, match.index, '{', '}')
    if (endLine) {
      const chunkContent = content.slice(match.index, endLine)
      chunks.push({
        id: `chunk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        content: chunkContent,
        location: { file, line: startLine },
        symbol: match[1],
        type: 'interface',
        language: 'typescript',
        metadata: {
          startLine,
          endLine,
          size: chunkContent.length,
        },
      })
    }
  }

  // If no specific symbols found, chunk the whole file
  if (chunks.length === 0) {
    chunks.push({
      id: `chunk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content,
      location: { file, line: 1 },
      type: 'file',
      language: 'typescript',
      metadata: {
        startLine: 1,
        endLine: lines.length,
        size: content.length,
      },
    })
  }

  return chunks
}

// JavaScript parser
function parseJavaScript(content: string, file: string): CodeChunk[] {
  // Same as TypeScript for now
  return parseTypeScript(content, file)
}

// Python parser
function parsePython(content: string, file: string): CodeChunk[] {
  const chunks: CodeChunk[] = []
  const lines = content.split('\n')

  // Find classes and functions
  const classRegex = /^class\s+(\w+)(?:\([^)]*\))?:/gm

  let match

  while ((match = classRegex.exec(content)) !== null) {
    const startLine = content.slice(0, match.index).split('\n').length
    const endLine = findPythonBlockEnd(content, match.index)
    const chunkContent = content.slice(match.index, endLine)

    chunks.push({
      id: `chunk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: chunkContent,
      location: { file, line: startLine },
      symbol: match[1],
      type: 'class',
      language: 'python',
      metadata: {
        startLine,
        endLine,
        size: chunkContent.length,
      },
    })
  }

  // If no classes found, use generic chunking
  if (chunks.length === 0) {
    chunks.push({
      id: `chunk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content,
      location: { file, line: 1 },
      type: 'file',
      language: 'python',
      metadata: {
        startLine: 1,
        endLine: lines.length,
        size: content.length,
      },
    })
  }

  return chunks
}

// Generic parser for unknown languages
function parseGeneric(content: string, file: string): CodeChunk[] {
  const lines = content.split('\n')
  return [{
    id: `chunk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    content,
    location: { file, line: 1 },
    type: 'file',
    language: 'text',
    metadata: {
      startLine: 1,
      endLine: lines.length,
      size: content.length,
    },
  }]
}

// Helper to find block range with brace matching
function findBlockRange(content: string, start: number, open: string, close: string): [number, number] | null {
  let depth = 0
  let inString: string | null = null
  let escaped = false

  for (let i = start; i < content.length; i++) {
    const char = content[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = true
      continue
    }

    if (inString) {
      if (char === inString) {
        inString = null
      }
      continue
    }

    if (char === '"' || char === '\'' || char === '`') {
      inString = char
      continue
    }

    if (char === open) {
      depth++
      if (depth === 1)
        continue
    }
    else if (char === close) {
      depth--
      if (depth === 0) {
        return [content.slice(start, i + 1).split('\n').length, i + 1]
      }
    }
  }

  return null
}

// Helper to find line end for Python-style blocks
function findLineEnd(content: string, start: number, _open: string, _close: string): number | null {
  for (let i = start; i < content.length; i++) {
    if (content[i] === '\n') {
      return i
    }
  }
  return null
}

// Helper to find Python block end
function findPythonBlockEnd(content: string, start: number): number {
  let depth = 0
  let lineStart = start

  for (let i = start; i < content.length; i++) {
    if (content[i] === '\n') {
      const line = content.slice(lineStart, i).trim()
      if (line.startsWith('class ') || line.startsWith('def ') || line.startsWith('async def ')) {
        if (depth === 0)
          depth = 1
      }
      lineStart = i + 1
    }

    if (content[i] === ':' && depth === 1) {
      // Check if next line is indented
      const nextLineStart = i + 1
      const nextNewline = content.indexOf('\n', nextLineStart)
      if (nextNewline !== -1) {
        const nextLine = content.slice(nextLineStart, nextNewline)
        if (nextLine.startsWith('    ') || nextLine.startsWith('\t')) {
          // This is a block start
          // Continue until we find a line at the same or less indentation
          let blockEnd = nextNewline
          const baseIndent = nextLine.match(/^(\s*)/)?.[1].length || 0

          for (let j = nextNewline + 1; j < content.length; j++) {
            const lineEnd = content.indexOf('\n', j)
            if (lineEnd === -1)
              break

            const line = content.slice(j, lineEnd)
            const indent = line.match(/^(\s*)/)?.[1].length || 0

            if (line.trim() && indent < baseIndent) {
              blockEnd = j
              break
            }
            blockEnd = lineEnd
          }

          return blockEnd
        }
      }
    }
  }

  return content.length
}

export interface ChunkMetadata {
  projectId: string
  chunkId: string
  file: string
  type: string
  language: string
  symbol?: string
  startLine: number
  endLine: number
}
