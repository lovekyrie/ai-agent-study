import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findMonorepoRoot } from '@ai-agent-study/workspace'
import dotenv from 'dotenv'

/** 最近一次 applyTestEnv 写入的键，供 clearTestEnv 清理 */
let lastAppliedKeys: string[] = []

const REPO_ROOT = findMonorepoRoot(
  fileURLToPath(new URL('.', import.meta.url)),
)

const DEFAULT_CANDIDATES = ['.env.test', '.env.test.example'] as const

function resolveTestEnvPath(customPath?: string): string {
  if (customPath)
    return resolve(customPath)

  for (const name of DEFAULT_CANDIDATES) {
    const candidate = resolve(REPO_ROOT, name)
    if (existsSync(candidate))
      return candidate
  }

  return resolve(REPO_ROOT, '.env.test')
}

/** 解析测试 env 文件为键值对（不写入 process.env） */
export function loadTestEnvFile(path?: string): Record<string, string> {
  const envPath = resolveTestEnvPath(path)
  if (!existsSync(envPath)) {
    throw new Error(
      `Test env file not found: ${envPath}. Copy .env.test.example to .env.test at repo root.`,
    )
  }
  return dotenv.parse(readFileSync(envPath, 'utf-8'))
}

/** @deprecated 使用 loadTestEnvFile()；保留兼容旧引用 */
export function getTestEnv(path?: string): Record<string, string> {
  return loadTestEnvFile(path)
}

export interface ApplyTestEnvOptions {
  /** 自定义 env 文件路径 */
  path?: string
  /** 覆盖文件中的值 */
  overrides?: Record<string, string>
}

/** 从 .env.test（或 .env.test.example）加载并写入 process.env */
export function applyTestEnv(options: ApplyTestEnvOptions = {}): void {
  const fromFile = loadTestEnvFile(options.path)
  const merged = { ...fromFile, ...options.overrides }
  lastAppliedKeys = Object.keys(merged)
  for (const [key, value] of Object.entries(merged)) {
    process.env[key] = value
  }
}

/** 清理 applyTestEnv 写入的键；也可传入自定义键列表 */
export function clearTestEnv(keys?: string[]): void {
  const toClear = keys ?? lastAppliedKeys
  for (const key of toClear) {
    delete process.env[key]
  }
  if (!keys)
    lastAppliedKeys = []
}
