import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { findMonorepoRoot } from '../src/find-monorepo-root.js'

describe('findMonorepoRoot', () => {
  it('should resolve directory containing pnpm-workspace.yaml', () => {
    const pkgDir = fileURLToPath(new URL('.', import.meta.url))
    const root = findMonorepoRoot(pkgDir)
    expect(existsSync(resolve(root, 'pnpm-workspace.yaml'))).toBe(true)
  })
})
