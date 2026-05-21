// Input sanitization and injection prevention
import path from 'node:path'

export interface SanitizeOptions {
  stripHtml?: boolean
  maxLength?: number
  allowPatterns?: RegExp[]
  blockPatterns?: RegExp[]
}

const DEFAULT_BLOCK_PATTERNS = [
  /<script[^>]*>[\s\S]*?<\/script>/gi,
  /<iframe[^>]*>[\s\S]*?<\/iframe>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /data:/gi,
  /vbscript:/gi,
  /expression\s*\(/gi,
  /url\s*\(/gi,
  /import\s+/gi,
]

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(previous|above|all)\s+(instructions?|commands?|rules?)/gi,
  /forget\s+(previous|above|all)\s+(instructions?|commands?|rules?)/gi,
  /disregard\s+(previous|above|all)\s+(instructions?|commands?|rules?)/gi,
  /you\s+are\s+now\s+(a|an)\s+(different|new|other)\s+/gi,
  /pretend\s+(you|to|that)/gi,
  /system\s*prompt/gi,
  /#\s*instruction/gi,
  /\[INST\]/gi,
  /\[SYS\]/gi,
  /\{\{.*?\}\}/g,
]

export class InputSanitizer {
  private options: SanitizeOptions
  private blockPatterns: RegExp[]
  private promptInjectPatterns: RegExp[]

  constructor(options: SanitizeOptions = {}) {
    this.options = {
      stripHtml: true,
      maxLength: 100000,
      allowPatterns: [],
      blockPatterns: DEFAULT_BLOCK_PATTERNS,
      ...options,
    }
    this.blockPatterns = this.options.blockPatterns || DEFAULT_BLOCK_PATTERNS
    this.promptInjectPatterns = PROMPT_INJECTION_PATTERNS
  }

  sanitize(input: string): { sanitized: string, threats: Threat[] } {
    const threats: Threat[] = []
    let sanitized = input

    // Check length
    if (this.options.maxLength && sanitized.length > this.options.maxLength) {
      threats.push({
        type: 'max_length',
        severity: 'medium',
        message: `Input exceeds max length ${this.options.maxLength}`,
      })
      sanitized = sanitized.slice(0, this.options.maxLength)
    }

    // Strip HTML if enabled
    if (this.options.stripHtml) {
      const before = sanitized
      sanitized = this.stripHtml(sanitized)
      if (before !== sanitized) {
        threats.push({
          type: 'html_tags',
          severity: 'high',
          message: 'HTML tags removed',
        })
      }
    }

    // Check block patterns
    for (const pattern of this.blockPatterns) {
      const matches = sanitized.match(pattern)
      if (matches) {
        threats.push({
          type: 'malicious_pattern',
          severity: 'high',
          message: `Blocked pattern detected: ${pattern.source}`,
          matches: matches.slice(0, 3),
        })
        sanitized = sanitized.replace(pattern, '[BLOCKED]')
      }
    }

    const injection = this.detectPromptInjection(sanitized)
    threats.push(...injection.threats)

    // Check allow patterns
    if (this.options.allowPatterns && this.options.allowPatterns.length > 0) {
      const matchesAllowed = this.options.allowPatterns.some(p => p.test(sanitized))
      if (!matchesAllowed && sanitized.trim().length > 0) {
        threats.push({
          type: 'pattern_mismatch',
          severity: 'low',
          message: 'Input does not match allowed patterns',
        })
      }
    }

    return { sanitized, threats }
  }

  detectPromptInjection(input: string): { isInjection: boolean, threats: Threat[] } {
    const threats: Threat[] = []

    for (const pattern of this.promptInjectPatterns) {
      const matches = input.match(pattern)
      if (matches) {
        threats.push({
          type: 'prompt_injection',
          severity: 'critical',
          message: `Prompt injection pattern detected: ${pattern.source}`,
          matches: matches.slice(0, 5),
        })
      }
    }

    return {
      isInjection: threats.length > 0,
      threats,
    }
  }

  private stripHtml(input: string): string {
    const decoded = input
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, '\'')
      .replace(/&nbsp;/g, ' ')
    return decoded.replace(/<[^>]*>/g, '')
  }
}

export interface Threat {
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  matches?: string[]
}

// Tool execution sandbox
export interface SandboxOptions {
  timeout?: number
  memoryLimit?: number
  allowedModules?: string[]
  blockedModules?: string[]
  maxFileSize?: number
}

export class Sandbox {
  private timeout: number
  private memoryLimit: number
  private allowedModules: Set<string>
  private blockedModules: Set<string>
  private maxFileSize: number

  constructor(options: SandboxOptions = {}) {
    this.timeout = options.timeout || 30000
    this.memoryLimit = options.memoryLimit || 100 * 1024 * 1024 // 100MB
    this.allowedModules = new Set(options.allowedModules || ['fs', 'path', 'crypto'])
    this.blockedModules = new Set(options.blockedModules || ['child_process', 'cluster', 'net', 'tls', 'dgram', 'dns'])
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024 // 10MB
  }

  isModuleAllowed(module: string): boolean {
    if (this.blockedModules.has(module))
      return false
    if (this.allowedModules.size > 0)
      return this.allowedModules.has(module)
    return true
  }

  validateFilePath(filePath: string, allowedDirs: string[]): boolean {
    const target = pathModuleResolve(filePath)
    return allowedDirs.some((dir) => {
      const allowed = pathModuleResolve(dir)
      const relative = path.relative(allowed, target)
      return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
    })
  }

  validateFileSize(size: number): boolean {
    return size <= this.maxFileSize
  }

  checkMemoryUsage(currentUsage: number): boolean {
    return currentUsage <= this.memoryLimit
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const before = process.memoryUsage().heapUsed
    if (!this.checkMemoryUsage(before)) {
      throw new Error('Memory limit exceeded before sandboxed operation started')
    }

    let timeoutId: NodeJS.Timeout | undefined
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`Sandbox timeout after ${this.timeout}ms`)), this.timeout)
        }),
      ])
    }
    finally {
      if (timeoutId)
        clearTimeout(timeoutId)
      const after = process.memoryUsage().heapUsed
      if (!this.checkMemoryUsage(after)) {
        throw new Error('Memory limit exceeded after sandboxed operation completed')
      }
    }
  }
}

// Allowlist/Denylist for tools and resources
export class AccessControl {
  private toolAllowlist = new Set<string>()
  private toolDenylist = new Set<string>()
  private resourceAllowlist = new Map<string, RegExp[]>()
  private resourceDenylist = new Map<string, RegExp[]>()
  private defaultAllow: boolean

  constructor(options: { defaultAllow?: boolean } = {}) {
    this.defaultAllow = options.defaultAllow ?? false
  }

  allowTool(toolName: string): void {
    this.toolAllowlist.add(toolName)
    this.toolDenylist.delete(toolName)
  }

  denyTool(toolName: string): void {
    this.toolDenylist.add(toolName)
    this.toolAllowlist.delete(toolName)
  }

  isToolAllowed(toolName: string): boolean {
    if (this.toolDenylist.has(toolName))
      return false
    if (this.toolAllowlist.size > 0)
      return this.toolAllowlist.has(toolName)
    return this.defaultAllow
  }

  allowResource(resourceType: string, patterns: RegExp[]): void {
    this.resourceAllowlist.set(resourceType, patterns)
  }

  denyResource(resourceType: string, patterns: RegExp[]): void {
    this.resourceDenylist.set(resourceType, patterns)
  }

  isResourceAllowed(resourceType: string, value: string): boolean {
    const denylist = this.resourceDenylist.get(resourceType)
    if (denylist) {
      for (const pattern of denylist) {
        if (pattern.test(value))
          return false
      }
    }

    const allowlist = this.resourceAllowlist.get(resourceType)
    if (allowlist) {
      for (const pattern of allowlist) {
        if (pattern.test(value))
          return true
      }
      return false
    }

    return this.defaultAllow
  }

  clearToolRestrictions(): void {
    this.toolAllowlist.clear()
    this.toolDenylist.clear()
  }

  clearResourceRestrictions(): void {
    this.resourceAllowlist.clear()
    this.resourceDenylist.clear()
  }
}

function pathModuleResolve(value: string): string {
  return path.resolve(value)
}

// Secret detection and redaction
const SECRET_PATTERNS = [
  { name: 'api_key', pattern: /\b(?:api[_-]?key|apikey)[=:\s]*['"]?([\w-]{20,})['"]?/gi },
  { name: 'password', pattern: /\b(?:password|passwd|pwd)[=:\s]*['"]?([^\s'"]{8,})['"]?/gi },
  { name: 'token', pattern: /\b(?:token|auth[_-]?token|access[_-]?token)[=:\s]*['"]?([\w-]{20,})['"]?/gi },
  { name: 'secret', pattern: /\b(?:secret|client[_-]?secret)[=:\s]*['"]?([\w/-]{20,})['"]?/gi },
  { name: 'private_key', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'aws_key', pattern: /\b(?:AKIA|ABIA|ACCA)[A-Z0-9]{16}\b/g },
  { name: 'github_token', pattern: /gh[pousr]_\w{36,}/g },
  { name: 'jwt', pattern: /eyJ[\w-]*\.eyJ[\w-]*\.[\w-]*/g },
]

export class SecretDetector {
  private customPatterns: { name: string, pattern: RegExp }[] = []

  addPattern(name: string, pattern: RegExp): void {
    this.customPatterns.push({ name, pattern })
  }

  detect(input: string): SecretFinding[] {
    const findings: SecretFinding[] = []

    for (const secretType of SECRET_PATTERNS) {
      const matches = input.matchAll(secretType.pattern)
      for (const match of matches) {
        findings.push({
          type: secretType.name,
          value: match[0],
          index: match.index || 0,
          redacted: this.redact(match[0]),
        })
      }
    }

    for (const custom of this.customPatterns) {
      const matches = input.matchAll(custom.pattern)
      for (const match of matches) {
        findings.push({
          type: custom.name,
          value: match[0],
          index: match.index || 0,
          redacted: this.redact(match[0]),
        })
      }
    }

    return findings.sort((a, b) => a.index - b.index)
  }

  redact(input: string): string {
    if (input.length <= 8)
      return '***'
    return input.slice(0, 4) + '*'.repeat(input.length - 8) + input.slice(-4)
  }

  containsSecrets(input: string): boolean {
    return this.detect(input).length > 0
  }

  removeSecrets(input: string): string {
    let result = input
    for (const finding of this.detect(input)) {
      result = result.replace(finding.value, finding.redacted)
    }
    return result
  }
}

export interface SecretFinding {
  type: string
  value: string
  index: number
  redacted: string
}

// Audit logging
export interface AuditEvent {
  timestamp: Date
  userId?: string
  sessionId?: string
  action: string
  resource?: string
  resourceId?: string
  outcome: 'success' | 'failure' | 'denied'
  metadata?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

export class AuditLogger {
  private events: AuditEvent[] = []
  private maxEvents: number

  constructor(maxEvents: number = 10000) {
    this.maxEvents = maxEvents
  }

  log(event: Omit<AuditEvent, 'timestamp'>): void {
    const fullEvent: AuditEvent = {
      ...event,
      timestamp: new Date(),
    }

    this.events.push(fullEvent)

    if (this.events.length > this.maxEvents) {
      this.events.shift()
    }
  }

  query(filter?: {
    userId?: string
    sessionId?: string
    action?: string
    resource?: string
    outcome?: AuditEvent['outcome']
    since?: Date
    until?: Date
  }): AuditEvent[] {
    let results = [...this.events]

    if (filter) {
      if (filter.userId) {
        results = results.filter(e => e.userId === filter.userId)
      }
      if (filter.sessionId) {
        results = results.filter(e => e.sessionId === filter.sessionId)
      }
      if (filter.action) {
        results = results.filter(e => e.action === filter.action)
      }
      if (filter.resource) {
        results = results.filter(e => e.resource === filter.resource)
      }
      if (filter.outcome) {
        results = results.filter(e => e.outcome === filter.outcome)
      }
      if (filter.since) {
        results = results.filter(e => e.timestamp >= filter.since!)
      }
      if (filter.until) {
        results = results.filter(e => e.timestamp <= filter.until!)
      }
    }

    return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }

  getRecent(count: number = 100): AuditEvent[] {
    return this.events.slice(-count)
  }

  clear(): void {
    this.events = []
  }

  count(): number {
    return this.events.length
  }
}
