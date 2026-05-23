import type { Loader, SourceDocument } from './types.js'
import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { normalizeWhitespace, stableHash } from './utils.js'

export class MemoryDocumentLoader implements Loader {
  constructor(private readonly documents: SourceDocument[]) {}

  async load(): Promise<SourceDocument[]> {
    return this.documents.map(doc => ({
      ...doc,
      id: doc.id ?? stableHash(`${doc.source}:${doc.content}`),
      content: normalizeWhitespace(doc.content),
    }))
  }
}

export interface FileSystemLoaderOptions {
  rootDir: string
  extensions?: string[]
  excludeDirs?: string[]
}

export class FileSystemDocumentLoader implements Loader {
  private readonly extensions: Set<string>
  private readonly excludeDirs: Set<string>

  constructor(private readonly options: FileSystemLoaderOptions) {
    this.extensions = new Set(options.extensions ?? ['.md', '.txt', '.ts', '.tsx', '.js', '.jsx', '.json'])
    this.excludeDirs = new Set(options.excludeDirs ?? ['node_modules', 'dist', '.git', 'coverage'])
  }

  async load(): Promise<SourceDocument[]> {
    const files = await this.walk(this.options.rootDir)
    const documents: SourceDocument[] = []

    for (const file of files) {
      const content = normalizeWhitespace(await readFile(file, 'utf8'))
      const source = relative(this.options.rootDir, file)
      documents.push({
        id: stableHash(`${source}:${content}`),
        source,
        content,
        metadata: { extension: extname(file), loader: 'filesystem' },
      })
    }

    return documents
  }

  private async walk(dir: string): Promise<string[]> {
    const entries = await readdir(dir)
    const files: string[] = []

    for (const entry of entries) {
      if (this.excludeDirs.has(entry))
        continue
      const path = join(dir, entry)
      const info = await stat(path)
      if (info.isDirectory()) {
        files.push(...await this.walk(path))
      }
      else if (this.extensions.has(extname(entry))) {
        files.push(path)
      }
    }

    return files
  }
}
