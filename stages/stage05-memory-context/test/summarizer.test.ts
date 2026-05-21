import type { ChatMessage, LLMClient } from '@ai-agent-study/llm-client'
import { describe, expect, it, vi } from 'vitest'
import { isSummaryMessage, summarizeHistory } from '../src/index.js'

function fakeClient(response: string): {
  client: LLMClient
  calls: ChatMessage[][]
} {
  const calls: ChatMessage[][] = []
  const client = {
    chat: vi.fn(async (messages: ChatMessage[]) => {
      calls.push([...messages])
      return { content: response, finishReason: 'stop' as const }
    }),
    stream: vi.fn(),
    jsonStructured: vi.fn(),
  } as unknown as LLMClient
  return { client, calls }
}

describe('summarizeHistory', () => {
  it('keepRecent 内的消息原样保留', async () => {
    const { client } = fakeClient('FAKE_SUMMARY')
    const messages: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ]
    // 只有 2 条 non-system，<= keepRecent 4，不压缩
    const result = await summarizeHistory(messages, client, { keepRecent: 4 })
    expect(result.summarizedCount).toBe(0)
    expect(result.messages).toEqual(messages)
  })

  it('超出 keepRecent 时把早期消息压缩成摘要 system 节点', async () => {
    const { client, calls } = fakeClient('用户问了 5 个问题，助手都回答了')
    const messages: ChatMessage[] = [
      { role: 'system', content: '你是助手' },
      ...Array.from({ length: 10 }, (_, i): ChatMessage => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `m${i}`,
      })),
    ]

    const result = await summarizeHistory(messages, client, { keepRecent: 3 })

    expect(result.summarizedCount).toBe(7) // 10 - 3
    expect(result.keptCount).toBe(3)
    expect(result.summary).toBe('用户问了 5 个问题，助手都回答了')

    // 输出: [system, summary, m7, m8, m9]
    expect(result.messages).toHaveLength(5)
    expect(result.messages[0].role).toBe('system')
    expect(isSummaryMessage(result.messages[1])).toBe(true)
    expect(result.messages[1].content).toContain('用户问了 5 个问题')
    expect(result.messages[2].content).toBe('m7')
    expect(result.messages[4].content).toBe('m9')

    // 验证 LLM 被正确调用了一次
    expect(calls).toHaveLength(1)
    expect(calls[0][1].content).toContain('m0') // 早期消息进入了压缩输入
    expect(calls[0][1].content).not.toContain('m7') // 最近消息不进入压缩
  })

  it('previousSummary 触发"增量摘要"路径', async () => {
    const { client, calls } = fakeClient('合并后的新摘要')
    const messages: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      ...Array.from({ length: 6 }, (_, i): ChatMessage => ({
        role: 'user' as const,
        content: `m${i}`,
      })),
    ]

    await summarizeHistory(messages, client, {
      keepRecent: 2,
      previousSummary: '之前用户问了 3 件事',
    })

    // 验证 LLM 看到了"已有摘要"
    const userPrompt = calls[0][1].content
    expect(userPrompt).toContain('[已有摘要]')
    expect(userPrompt).toContain('之前用户问了 3 件事')
    expect(userPrompt).toContain('[新对话]')
  })

  it('没有 system head 时摘要仍然以 system 角色注入', async () => {
    const { client } = fakeClient('summary')
    const messages: ChatMessage[] = Array.from({ length: 6 }, (_, i): ChatMessage => ({
      role: 'user' as const,
      content: `m${i}`,
    }))

    const result = await summarizeHistory(messages, client, { keepRecent: 2 })

    expect(result.messages[0].role).toBe('system')
    expect(isSummaryMessage(result.messages[0])).toBe(true)
  })

  it('lLM 失败时抛错（让上层决定降级策略）', async () => {
    const client = {
      chat: vi.fn(async () => {
        throw new Error('LLM 500')
      }),
      stream: vi.fn(),
      jsonStructured: vi.fn(),
    } as unknown as LLMClient

    const messages: ChatMessage[] = Array.from({ length: 6 }, (_, i): ChatMessage => ({
      role: 'user' as const,
      content: `m${i}`,
    }))

    await expect(summarizeHistory(messages, client, { keepRecent: 2 })).rejects.toThrow(
      /LLM 500/,
    )
  })

  it('isSummaryMessage 通过约定前缀识别', () => {
    expect(isSummaryMessage({ role: 'system', content: '[历史摘要] xyz' })).toBe(true)
    expect(isSummaryMessage({ role: 'system', content: '普通 system' })).toBe(false)
    expect(isSummaryMessage({ role: 'user', content: '[历史摘要] xyz' })).toBe(false)
  })
})
