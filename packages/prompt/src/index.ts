// ============================================================================
// 类型定义
// ============================================================================

export interface PromptTemplate {
  system?: string
  user: string
  examples?: Array<{ input: string, output: string }>
}

export interface PromptContext {
  [key: string]: string | number | boolean | string[] | number[] | null | undefined
}

export type PromptRole = 'system' | 'user' | 'assistant'

export interface PromptMessage {
  role: PromptRole
  content: string
}

export interface RenderOptions {
  /**
   * 变量未定义/为 null 时的处理方式
   * - 'keep' (默认): 保留 `{{name}}` 字面量
   * - 'empty': 替换为空字符串
   * - 'throw': 抛出错误（推荐生产环境）
   */
  onMissing?: 'keep' | 'empty' | 'throw'
}

// ============================================================================
// 渲染：变量插值
// ============================================================================

// 支持空格 `{{ name }}` 与中文/Unicode 变量名（Mustache 风格）
const PLACEHOLDER_PATTERN = /\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu

export function render(
  template: string,
  context: PromptContext,
  options: RenderOptions = {},
): string {
  const onMissing = options.onMissing ?? 'keep'

  return template.replace(PLACEHOLDER_PATTERN, (_match, key: string) => {
    const value = context[key]

    if (value === undefined || value === null) {
      if (onMissing === 'throw') {
        throw new Error(`Missing prompt variable: ${key}`)
      }
      return onMissing === 'empty' ? '' : `{{${key}}}`
    }

    if (Array.isArray(value))
      return value.join(', ')
    return String(value)
  })
}

// ============================================================================
// buildMessages：拼装 system + few-shot + user 消息
// ============================================================================

export function buildMessages(
  template: PromptTemplate,
  context: PromptContext,
  options: RenderOptions = {},
): PromptMessage[] {
  const messages: PromptMessage[] = []

  if (template.system) {
    messages.push({ role: 'system', content: render(template.system, context, options) })
  }

  // few-shot 是静态演示样本，不参与当前请求的变量插值
  if (template.examples) {
    for (const example of template.examples) {
      messages.push({ role: 'user', content: example.input })
      messages.push({ role: 'assistant', content: example.output })
    }
  }

  messages.push({ role: 'user', content: render(template.user, context, options) })

  return messages
}

// ============================================================================
// 输入清理 / Prompt 注入防护（最小可用版本）
// ============================================================================

// 角色注入常见模式：用户输入里假装是 system / assistant
const ROLE_INJECTION_PATTERN
  = /(?:^|\n)\s*(system|assistant|user)\s*[:：]/gi

// 常见 jailbreak 关键词（中英文）
const SUSPICIOUS_PHRASES = [
  /ignore (?:all |the )?(?:previous|above|prior) (?:instructions?|prompts?|rules?)/i,
  /disregard (?:all |the )?(?:previous|above)/i,
  /forget (?:everything|all) (?:above|prior|previous)/i,
  /you are now/i,
  /忽略(?:上面|之前|以上)的?(?:指令|规则|提示)/,
  /忘记(?:上面|之前|以上)的?(?:一切|内容)/,
]

export interface SanitizeOptions {
  /** 移除控制字符（默认 true） */
  stripControlChars?: boolean
  /** 检测到注入嫌疑时是否抛错（默认 false，仅返回 warnings） */
  throwOnSuspicious?: boolean
  /** 单条用户输入字符上限（默认 10000） */
  maxLength?: number
}

export interface SanitizeResult {
  text: string
  warnings: string[]
  truncated: boolean
}

export function sanitizeUserInput(
  input: string,
  options: SanitizeOptions = {},
): SanitizeResult {
  const { stripControlChars = true, throwOnSuspicious = false, maxLength = 10_000 } = options
  const warnings: string[] = []

  let text = input

  if (stripControlChars) {
    // 移除除 \t \n \r 之外的控制字符（含零宽字符常见的 prompt injection 载体）
    // eslint-disable-next-line no-control-regex
    text = text.replace(/[\x00-\x08\v\f\x0E-\x1F\x7F\u200B-\u200F\u202A-\u202E]/g, '')
  }

  if (ROLE_INJECTION_PATTERN.test(text)) {
    warnings.push('Detected role-injection pattern (e.g. "system:" / "assistant:")')
  }
  // 重置 lastIndex（全局正则副作用）
  ROLE_INJECTION_PATTERN.lastIndex = 0

  for (const pattern of SUSPICIOUS_PHRASES) {
    if (pattern.test(text)) {
      warnings.push(`Detected suspicious phrase: ${pattern.source}`)
    }
  }

  let truncated = false
  if (text.length > maxLength) {
    text = text.slice(0, maxLength)
    truncated = true
    warnings.push(`Input truncated to ${maxLength} characters`)
  }

  if (throwOnSuspicious && warnings.some(w => w.startsWith('Detected'))) {
    throw new Error(`Suspicious user input: ${warnings.join('; ')}`)
  }

  return { text, warnings, truncated }
}

// ============================================================================
// 上下文裁剪（最小可用版本）
// ============================================================================

export interface TruncateOptions {
  /** 总字符数上限 */
  maxChars: number
  /** 是否始终保留首条 system 消息（默认 true） */
  preserveSystem?: boolean
}

/**
 * 滑动窗口式裁剪：保留首条 system + 最近 N 条消息，超出 maxChars 从中间截掉。
 * 简单粗暴但够用；真正生产场景应该用 token 数 + 摘要。
 */
export function truncateMessages(
  messages: PromptMessage[],
  options: TruncateOptions,
): PromptMessage[] {
  const { maxChars, preserveSystem = true } = options
  if (messages.length === 0)
    return messages

  const systemHead
    = preserveSystem && messages[0]?.role === 'system' ? [messages[0]] : []
  const rest = messages.slice(systemHead.length)

  const charsOf = (m: PromptMessage) => m.content.length

  let total = systemHead.reduce((sum, m) => sum + charsOf(m), 0)
  const kept: PromptMessage[] = []

  // 从最新消息往前收集，保证最近上下文优先保留
  for (let i = rest.length - 1; i >= 0; i--) {
    const len = charsOf(rest[i])
    if (total + len > maxChars && kept.length > 0)
      break
    kept.unshift(rest[i])
    total += len
  }

  return [...systemHead, ...kept]
}

// ============================================================================
// 预置模板
// ============================================================================

export const CodeExplainTemplate: PromptTemplate = {
  system: `你是一个专业的代码解释器。请详细解释用户提供的代码。
用清晰、简洁的中文回答，适合有编程基础的开发者理解。
包含：整体功能、关键逻辑、重要函数、优点和改进建议。`,
  user: `请解释以下 {{language}} 代码：

\`\`\`{{language}}
{{code}}
\`\`\``,
}

export const EntityExtractTemplate: PromptTemplate = {
  system: `你是一个信息抽取专家。从用户提供的文本中提取结构化信息。
只返回 JSON 格式，不要有任何其他内容、解释或代码块标记。`,
  user: `从以下文本中提取实体信息（人名、组织、地点、日期等）：

{{text}}

请返回如下格式的 JSON：
{
  "entities": {
    "persons": [],
    "organizations": [],
    "locations": [],
    "dates": []
  }
}`,
}

export const SummaryTemplate: PromptTemplate = {
  system: `你是一个专业的文本摘要助手。请将用户提供的内容总结为简洁的摘要。
保留关键信息，删除冗余内容。用中文回答。`,
  user: `请为以下内容生成摘要：

{{content}}

摘要要求：{{requirement}}`,
}

export const CodeReviewTemplate: PromptTemplate = {
  system: `你是一个专业的代码审查员。请审查用户提供的代码，关注：
1. 潜在 bug 和错误
2. 性能问题
3. 安全漏洞
4. 代码风格和最佳实践

用中文回答，给出具体的改进建议。`,
  user: `请审查以下 {{language}} 代码：

\`\`\`{{language}}
{{code}}
\`\`\``,
  examples: [
    {
      input: '请审查以下 typescript 代码：\n```typescript\nfunction add(a: number, b: number) {\n  return a + b\n}\n```',
      output: '代码简洁正确，但建议添加返回类型注解：`function add(a: number, b: number): number`',
    },
  ],
}

export const RAGQueryOptimizerTemplate: PromptTemplate = {
  system: `你是一个搜索查询优化器。将用户的自然语言问题重写为更适合向量检索的查询。
考虑：关键词提取、同义词、相关概念。只返回优化后的查询文本。`,
  user: `原始问题：{{question}}

请给出 3 个不同角度的检索查询：`,
}
