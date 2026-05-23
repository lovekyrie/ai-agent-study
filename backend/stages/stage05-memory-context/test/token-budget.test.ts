import type { ChatMessage } from '@ai-agent-study/llm-client'
import { describe, expect, it } from 'vitest'
import {
  cjkEstimator,
  defaultEstimator,
  enforceBudget,
  estimateMessage,
  estimateMessages,
} from '../src/index.js'

describe('tokenEstimator', () => {
  it('defaultEstimator: chars/4 向上取整', () => {
    expect(defaultEstimator.estimate('')).toBe(0)
    expect(defaultEstimator.estimate('abcd')).toBe(1)
    expect(defaultEstimator.estimate('abcde')).toBe(2)
  })

  it('cjkEstimator: CJK 字符按 ~1 token/字', () => {
    // 4 个 CJK 字符 → ~4 token；纯英文 'abcdefgh' 8 字符 × 0.25 = 2 token
    expect(cjkEstimator.estimate('你好世界')).toBe(4)
    expect(cjkEstimator.estimate('abcdefgh')).toBe(2)
  })

  it('cjkEstimator 比 defaultEstimator 对中文更敏感', () => {
    const cjkText = '你好世界你好世界你好世界你好'
    const def = defaultEstimator.estimate(cjkText)
    const cjk = cjkEstimator.estimate(cjkText)
    expect(cjk).toBeGreaterThan(def)
  })

  it('estimateMessage 包含 framing 开销（约 4）', () => {
    const msg: ChatMessage = { role: 'user', content: 'hi' }
    // chars/4 = ceil(2/4) = 1, framing = 4 → total 5
    expect(estimateMessage(msg)).toBe(5)
  })

  it('estimateMessages 包含 priming 开销（约 3）', () => {
    const msgs: ChatMessage[] = [{ role: 'user', content: '' }]
    // estimateMessage = 4 + 0 = 4; priming = 3; total = 7
    expect(estimateMessages(msgs)).toBe(7)
  })
})

describe('enforceBudget', () => {
  const longContent = (n: number) => 'x'.repeat(n * 4) // 每个 message 大约 n token

  it('保留首条 system 并裁剪最早的非 system 消息', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'you are helpful' },
      { role: 'user', content: longContent(50) },
      { role: 'assistant', content: longContent(50) },
      { role: 'user', content: longContent(50) },
      { role: 'assistant', content: '最近一条' }, // 这条肯定保留
    ]

    const result = enforceBudget(messages, { maxTokens: 80 })

    expect(result.messages[0].role).toBe('system')
    expect(result.messages.at(-1).content).toBe('最近一条')
    expect(result.trimmedCount).toBeGreaterThan(0)
    expect(result.tokensUsed).toBeLessThanOrEqual(80)
  })

  it('reservedForResponse 会从 maxTokens 里扣减', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: longContent(20) },
      { role: 'user', content: longContent(20) },
      { role: 'user', content: longContent(20) },
    ]

    const tight = enforceBudget(messages, { maxTokens: 100, reservedForResponse: 80 })
    expect(tight.tokensBudget).toBe(20)
  })

  it('preserveSystem=false 时 system 不享受特权', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: longContent(100) },
      { role: 'user', content: '保留这条' },
    ]
    const out = enforceBudget(messages, { maxTokens: 50, preserveSystem: false })
    // 应该只剩最近的 user
    expect(out.messages.every(m => m.role !== 'system')).toBe(true)
  })

  it('budget 极小也至少保留 1 条非 system 消息（避免上下文全丢）', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: longContent(200) }, // 远超 budget
    ]
    const out = enforceBudget(messages, { maxTokens: 10 })
    // system + 最少 1 条 → 2
    expect(out.messages).toHaveLength(2)
  })

  it('budget 充足时不裁剪', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '你好' },
    ]
    const out = enforceBudget(messages, { maxTokens: 1000 })
    expect(out.messages).toHaveLength(3)
    expect(out.trimmedCount).toBe(0)
  })

  it('空数组返回空数组', () => {
    expect(enforceBudget([], { maxTokens: 1000 }).messages).toEqual([])
  })
})
