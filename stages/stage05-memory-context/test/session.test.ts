import { describe, expect, it, vi } from 'vitest'
import type { ChatMessage, LLMClient } from '@ai-agent-study/llm-client'
import { Session } from '../src/index.js'

function fakeClient(response: string): LLMClient {
  return {
    chat: vi.fn(async () => ({ content: response, finishReason: 'stop' as const })),
    stream: vi.fn(),
    jsonStructured: vi.fn(),
  } as unknown as LLMClient
}

describe('Session basic API', () => {
  it('生成稳定的 id 或使用调用方提供的 id', () => {
    const s1 = new Session({ systemPrompt: 'sys' })
    expect(s1.id).toMatch(/^sess_/)

    const s2 = new Session({ id: 'custom-id', systemPrompt: 'sys' })
    expect(s2.id).toBe('custom-id')
  })

  it('addUserMessage / addAssistantMessage / addToolMessage 各自落到 shortTerm 里', () => {
    const session = new Session({ systemPrompt: 'sys' })
    const u = session.addUserMessage('hi')
    const a = session.addAssistantMessage('hello')
    const t = session.addToolMessage('tool result')

    expect(session.shortTerm.size()).toBe(3)
    expect(session.shortTerm.get(u.id)?.role).toBe('user')
    expect(session.shortTerm.get(a.id)?.role).toBe('assistant')
    expect(session.shortTerm.get(t.id)?.role).toBe('tool')
  })

  it('reset() 清空 shortTerm 和 summary，但保留 systemPrompt', async () => {
    const session = new Session({
      systemPrompt: 'sys',
      llmClient: fakeClient('SUMMARY'),
    })
    for (let i = 0; i < 8; i++) session.addUserMessage(`m${i}`)
    await session.compress({ keepRecent: 2 })

    expect(session.getSummary()).toBe('SUMMARY')
    expect(session.shortTerm.size()).toBe(2)

    session.reset()

    expect(session.getSummary()).toBe('')
    expect(session.shortTerm.size()).toBe(0)
    expect(session.systemPrompt).toBe('sys')
  })
})

describe('Session.promoteToLongTerm', () => {
  it('未配置 longTermStore 时返回 false', async () => {
    const session = new Session({ systemPrompt: 'sys' })
    const e = session.addUserMessage('fact')
    expect(await session.promoteToLongTerm(e.id)).toBe(false)
  })

  it('配置了 longTermStore 后能成功提升并被检索到', async () => {
    const session = Session.withInMemoryLongTerm({ systemPrompt: 'sys' })
    const e = session.addUserMessage('我喜欢 TypeScript')
    expect(await session.promoteToLongTerm(e.id)).toBe(true)

    const ctx = await session.getMessagesForLLM({
      retrievalQuery: 'TypeScript',
      longTermTopK: 5,
    })
    expect(ctx.retrievedCount).toBe(1)
    const block = ctx.messages.find(
      (m: ChatMessage) => m.role === 'system' && m.content.includes('[相关历史片段]')
    )
    expect(block?.content).toContain('TypeScript')
  })

  it('不存在的 entryId 返回 false', async () => {
    const session = Session.withInMemoryLongTerm({ systemPrompt: 'sys' })
    expect(await session.promoteToLongTerm('nonexistent')).toBe(false)
  })
})

describe('Session.compress', () => {
  it('没有 llmClient → 返回 null', async () => {
    const session = new Session({ systemPrompt: 'sys' })
    for (let i = 0; i < 8; i++) session.addUserMessage(`m${i}`)
    expect(await session.compress()).toBeNull()
  })

  it('shortTerm 条数 <= keepRecent → 不值得压缩，返回 null', async () => {
    const session = new Session({ systemPrompt: 'sys', llmClient: fakeClient('x') })
    session.addUserMessage('only-one')
    expect(await session.compress({ keepRecent: 4 })).toBeNull()
  })

  it('压缩后：shortTerm 收缩到 keepRecent，summary 被更新', async () => {
    const client = fakeClient('用户陆续说了 5 件事')
    const session = new Session({ systemPrompt: 'sys', llmClient: client })

    for (let i = 0; i < 10; i++) session.addUserMessage(`m${i}`)

    const result = await session.compress({ keepRecent: 3 })

    expect(result).not.toBeNull()
    expect(result?.summarizedCount).toBe(7)
    expect(result?.keptCount).toBe(3)
    expect(session.shortTerm.size()).toBe(3)
    expect(session.getSummary()).toBe('用户陆续说了 5 件事')

    // 保留下来的应该是最近 3 条
    expect(session.shortTerm.getAll().map((e) => e.content)).toEqual(['m7', 'm8', 'm9'])
  })

  it('压缩后再次 compress 触发增量摘要', async () => {
    const client = {
      chat: vi
        .fn()
        .mockResolvedValueOnce({ content: '第一段摘要', finishReason: 'stop' as const })
        .mockResolvedValueOnce({ content: '合并后的摘要', finishReason: 'stop' as const }),
      stream: vi.fn(),
      jsonStructured: vi.fn(),
    } as unknown as LLMClient

    const session = new Session({ systemPrompt: 'sys', llmClient: client })

    for (let i = 0; i < 10; i++) session.addUserMessage(`m${i}`)
    await session.compress({ keepRecent: 3 })
    expect(session.getSummary()).toBe('第一段摘要')

    // 再灌入更多消息后再次压缩
    for (let i = 10; i < 20; i++) session.addUserMessage(`m${i}`)
    await session.compress({ keepRecent: 3 })

    expect(session.getSummary()).toBe('合并后的摘要')
    expect(session.shortTerm.size()).toBe(3)

    // 第二次调用 client.chat 时应该带上"已有摘要"
    const secondCallUserPrompt = (client.chat as ReturnType<typeof vi.fn>).mock.calls[1][0][1].content
    expect(secondCallUserPrompt).toContain('[已有摘要]')
    expect(secondCallUserPrompt).toContain('第一段摘要')
  })
})

describe('Session.getMessagesForLLM (integration)', () => {
  it('综合 system + summary + 长期检索 + 短期 + budget', async () => {
    const session = Session.withInMemoryLongTerm({
      systemPrompt: '你是助手',
      llmClient: fakeClient('过去聊了天气'),
    })

    // 1) 灌入并提升一条长期记忆
    const fact = session.addUserMessage('我住在北京')
    await session.promoteToLongTerm(fact.id)

    // 2) 灌入更多对话以触发压缩
    for (let i = 0; i < 10; i++) session.addUserMessage(`闲聊 ${i}`)

    // 3) 主动压缩
    await session.compress({ keepRecent: 3 })

    // 4) 拿最终 messages：system + summary + retrieval + short-term
    const ctx = await session.getMessagesForLLM({
      retrievalQuery: '北京',
      budget: { maxTokens: 2000 },
    })

    const systemMessages = ctx.messages.filter((m) => m.role === 'system')
    expect(systemMessages.length).toBeGreaterThanOrEqual(3) // main + summary + retrieval

    expect(ctx.messages[0].content).toBe('你是助手')
    expect(systemMessages.some((m) => m.content.includes('[历史摘要]'))).toBe(true)
    expect(systemMessages.some((m) => m.content.includes('[相关历史片段]'))).toBe(true)
  })
})
