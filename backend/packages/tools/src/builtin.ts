import type { ToolDefinition } from './types.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'

// ============================================================================
// read_file：限定 base dir + 大小限制 + 路径遍历防护
// ============================================================================

const READ_FILE_MAX_BYTES = 256 * 1024 // 256 KB
const READ_FILE_DEFAULT_BASE_DIR = process.cwd()

const readFileSchema = z.object({
  path: z.string().describe('文件路径，必须在允许的 baseDir 下'),
})

export const readFileTool: ToolDefinition<z.infer<typeof readFileSchema>> = {
  name: 'read_file',
  description: `读取本地文本文件（最大 ${READ_FILE_MAX_BYTES} 字节，仅限当前工作目录及其子目录）`,
  category: 'filesystem',
  requiresApproval: true,
  parameters: readFileSchema,
  execute: async (params, ctx) => {
    const baseDir = (ctx?.metadata?.readFileBaseDir as string | undefined) ?? READ_FILE_DEFAULT_BASE_DIR
    const resolvedBase = path.resolve(baseDir)
    const resolvedTarget = path.resolve(resolvedBase, params.path)

    // 路径遍历防护：目标必须在 baseDir 下
    if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
      return { content: '', error: `Path "${params.path}" is outside the allowed base dir` }
    }

    let stat: Awaited<ReturnType<typeof fs.stat>>
    try {
      stat = await fs.stat(resolvedTarget)
    }
    catch {
      return { content: '', error: `File not found: ${params.path}` }
    }
    if (!stat.isFile()) {
      return { content: '', error: `Not a regular file: ${params.path}` }
    }
    if (stat.size > READ_FILE_MAX_BYTES) {
      return {
        content: '',
        error: `File too large: ${stat.size} bytes (limit ${READ_FILE_MAX_BYTES})`,
      }
    }

    const content = await fs.readFile(resolvedTarget, 'utf-8')
    return {
      content,
      metadata: { path: resolvedTarget, size: stat.size },
    }
  },
}

// ============================================================================
// http_request：拒绝私网/loopback + 大小限制 + 超时 + 修复 header
// ============================================================================

const HTTP_DEFAULT_TIMEOUT_MS = 10_000
const HTTP_MAX_RESPONSE_BYTES = 1 * 1024 * 1024 // 1 MB

const httpRequestSchema = z.object({
  url: z.string().url().describe('请求 URL，仅允许 http/https'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.string().optional().describe('请求体（POST/PUT 时使用）'),
})

function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (lower === 'localhost' || lower === '::1' || lower === '0.0.0.0')
    return true
  // IPv4 私网段 + loopback + 链路本地 + 云元数据
  if (
    /^127\./.test(lower)
    || /^10\./.test(lower)
    || /^192\.168\./.test(lower)
    || /^169\.254\./.test(lower)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(lower)
  ) {
    return true
  }
  // IPv6 简单判断
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80'))
    return true
  return false
}

export const httpRequestTool: ToolDefinition<z.infer<typeof httpRequestSchema>> = {
  name: 'http_request',
  description: `发起 HTTP 请求（仅 http/https，禁止私网，响应最大 ${HTTP_MAX_RESPONSE_BYTES} 字节，${HTTP_DEFAULT_TIMEOUT_MS}ms 超时）`,
  category: 'network',
  requiresApproval: true,
  parameters: httpRequestSchema,
  execute: async (params) => {
    let parsedUrl: URL
    try {
      parsedUrl = new URL(params.url)
    }
    catch {
      return { content: '', error: `Invalid URL: ${params.url}` }
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return { content: '', error: `Unsupported protocol: ${parsedUrl.protocol}` }
    }
    if (isPrivateHost(parsedUrl.hostname)) {
      return { content: '', error: `Refused to request private/loopback host: ${parsedUrl.hostname}` }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), HTTP_DEFAULT_TIMEOUT_MS)

    try {
      // GET/DELETE 不应携带 Content-Type
      const baseHeaders: Record<string, string> = {}
      if (params.method !== 'GET' && params.method !== 'DELETE') {
        baseHeaders['Content-Type'] = 'application/json'
      }
      const response = await fetch(parsedUrl, {
        method: params.method,
        headers: { ...baseHeaders, ...params.headers },
        body: params.body,
        signal: controller.signal,
        redirect: 'follow',
      })

      // 流式读取，做大小限制
      const reader = response.body?.getReader()
      const chunks: Uint8Array[] = []
      let received = 0
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done)
            break
          if (value) {
            received += value.byteLength
            if (received > HTTP_MAX_RESPONSE_BYTES) {
              await reader.cancel()
              return {
                content: '',
                error: `Response too large (> ${HTTP_MAX_RESPONSE_BYTES} bytes)`,
                metadata: { status: response.status, truncated: true },
              }
            }
            chunks.push(value)
          }
        }
      }
      const text = Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf-8')
      return {
        content: text,
        metadata: { status: response.status, bytes: received },
      }
    }
    catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { content: '', error: `HTTP request timeout (>${HTTP_DEFAULT_TIMEOUT_MS}ms)` }
      }
      return {
        content: '',
        error: `HTTP request failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
    finally {
      clearTimeout(timeoutId)
    }
  },
}

// ============================================================================
// get_current_time
// ============================================================================

const getCurrentTimeSchema = z.object({
  timezone: z.string().optional().describe('IANA 时区（如 "Asia/Shanghai"）'),
})

export const getCurrentTimeTool: ToolDefinition<z.infer<typeof getCurrentTimeSchema>> = {
  name: 'get_current_time',
  description: '获取当前日期与时间',
  category: 'utility',
  parameters: getCurrentTimeSchema,
  execute: async (params) => {
    const now = new Date()
    try {
      const timeString = params.timezone
        ? now.toLocaleString('zh-CN', { timeZone: params.timezone })
        : now.toISOString()
      return {
        content: timeString,
        metadata: { timestamp: now.getTime(), timezone: params.timezone ?? 'UTC' },
      }
    }
    catch (error) {
      return {
        content: '',
        error: `Invalid timezone "${params.timezone}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }
  },
}

// ============================================================================
// calculator：安全表达式求值（不用 eval）
// ============================================================================

const calculatorSchema = z.object({
  expression: z.string().min(1).max(200).describe('数学表达式，仅支持 + - * / % ** ( )'),
})

/**
 * 简易递归下降表达式解析器，支持 + - * / % **，括号，浮点数与负号。
 * 不使用 eval / Function，避免任意代码执行。
 */
function evalExpression(input: string): number {
  let pos = 0
  const src = input.replace(/\s+/g, '')

  function peek(): string {
    return src[pos] ?? ''
  }
  function consume(): string {
    return src[pos++] ?? ''
  }

  function parsePrimary(): number {
    if (peek() === '(') {
      consume()
      const v = parseAddSub()
      if (consume() !== ')')
        throw new Error('Mismatched parentheses')
      return v
    }
    if (peek() === '-') {
      consume()
      return -parsePrimary()
    }
    if (peek() === '+') {
      consume()
      return parsePrimary()
    }
    let numStr = ''
    while (/[0-9.]/.test(peek())) numStr += consume()
    if (numStr === '' || numStr === '.')
      throw new Error(`Unexpected token at position ${pos}`)
    const n = Number(numStr)
    if (!Number.isFinite(n))
      throw new Error(`Invalid number: ${numStr}`)
    return n
  }

  function parsePower(): number {
    const left = parsePrimary()
    if (peek() === '*' && src[pos + 1] === '*') {
      pos += 2
      const right = parsePower() // 右结合
      return left ** right
    }
    return left
  }

  function parseMulDiv(): number {
    let left = parsePower()
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      // ** 已经在 parsePower 处理，避免误吞
      if (peek() === '*' && src[pos + 1] === '*')
        break
      const op = consume()
      const right = parsePower()
      if ((op === '/' || op === '%') && right === 0)
        throw new Error('Division by zero')
      if (op === '*')
        left *= right
      else if (op === '/')
        left /= right
      else left %= right
    }
    return left
  }

  function parseAddSub(): number {
    let left = parseMulDiv()
    while (peek() === '+' || peek() === '-') {
      const op = consume()
      const right = parseMulDiv()
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  const result = parseAddSub()
  if (pos < src.length)
    throw new Error(`Unexpected token at position ${pos}: ${src[pos]}`)
  if (!Number.isFinite(result))
    throw new Error(`Result is not a finite number`)
  return result
}

export const calculatorTool: ToolDefinition<z.infer<typeof calculatorSchema>> = {
  name: 'calculator',
  description: '计算数学表达式，支持 + - * / % ** 和括号',
  category: 'utility',
  parameters: calculatorSchema,
  execute: async (params) => {
    try {
      const result = evalExpression(params.expression)
      return { content: String(result), metadata: { expression: params.expression } }
    }
    catch (error) {
      return {
        content: '',
        error: `Failed to evaluate "${params.expression}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }
  },
}

// ============================================================================
// search_web：stub（真实实现需要外部 API key）
// ============================================================================

const searchWebSchema = z.object({
  query: z.string().min(1).describe('搜索关键词'),
})

export const searchWebTool: ToolDefinition<z.infer<typeof searchWebSchema>> = {
  name: 'search_web',
  description: '网络搜索（当前为 stub 占位，接入真实搜索 API 后才能使用）',
  category: 'network',
  parameters: searchWebSchema,
  execute: async (params) => {
    return {
      content: `Web search stub for: "${params.query}"\n（接入真实搜索 API 后会返回结果）`,
      metadata: { query: params.query, stub: true },
    }
  },
}

// ============================================================================
// 暴露内置工具集
// ============================================================================

export const builtinTools: ToolDefinition[] = [
  readFileTool,
  httpRequestTool,
  getCurrentTimeTool,
  calculatorTool,
  searchWebTool,
]
