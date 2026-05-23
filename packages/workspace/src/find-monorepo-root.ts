import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/** 从 startDir 向上查找含 pnpm-workspace.yaml 的 monorepo 根目录 */
export function findMonorepoRoot(startDir: string): string {
  let dir = resolve(startDir)
  while (true) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml')))
      return dir
    const parent = dirname(dir)
    if (parent === dir)
      break
    dir = parent
  }
  return process.cwd()
}
