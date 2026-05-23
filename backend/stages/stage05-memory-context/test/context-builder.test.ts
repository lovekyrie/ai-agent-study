import { describe, expect, it } from 'vitest'
import { buildContext, InMemoryLongTerm, ShortTermMemory } from '../src/index.js'

describe('buildContext', () => {
  it('只给 systemPrompt + 空短期记忆 → 只有一条 system 消息', async () => {
    const result = await buildContext({
      systemPrompt: 'sys',
      shortTerm: new ShortTermMemory(10),
    })
    expect(result.messages).toEqual([{ role: 'system', content: 'sys' }])
    expect(result.trimmedCount).toBe(0)
    expect(result.retrievedCount).toBe(0)
  })

  it('短期记忆按时间顺序追加到 messages 末尾', async () => {
    const stm = new ShortTermMemory(10)
    stm.add('u1', 'user')
    stm.add('a1', 'assistant')
    stm.add('u2', 'user')

    const result = await buildContext({
      systemPrompt: 'sys',
      shortTerm: stm,
    })

    expect(result.messages.map(m => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ])
    expect(result.messages.map(m => m.content)).toEqual(['sys', 'u1', 'a1', 'u2'])
  })

  it('累积摘要插入到 system prompt 之后', async () => {
    const stm = new ShortTermMemory(10)
    stm.add('recent', 'user')

    const result = await buildContext({
      systemPrompt: 'sys',
      summary: '过去 30 轮的总结',
      shortTerm: stm,
    })

    expect(result.messages).toHaveLength(3)
    expect(result.messages[0]).toEqual({ role: 'system', content: 'sys' })
    expect(result.messages[1].role).toBe('system')
    expect(result.messages[1].content).toContain('[历史摘要]')
    expect(result.messages[1].content).toContain('过去 30 轮的总结')
    expect(result.messages[2]).toEqual({ role: 'user', content: 'recent' })
  })

  it('空摘要不会插入空白 system 节点', async () => {
    const result = await buildContext({
      systemPrompt: 'sys',
      summary: '   ',
      shortTerm: new ShortTermMemory(10),
    })
    expect(result.messages).toHaveLength(1)
  })

  it('长期记忆 retrievalQuery 时拼成 system 节点', async () => {
    const longTerm = new InMemoryLongTerm()
    await longTerm.add({
      id: 'l1',
      content: 'TypeScript 是 JavaScript 的超集',
      role: 'assistant',
      timestamp: Date.now(),
    })
    await longTerm.add({
      id: 'l2',
      content: 'Rust 是系统编程语言',
      role: 'assistant',
      timestamp: Date.now(),
    })

    const result = await buildContext({
      systemPrompt: 'sys',
      shortTerm: new ShortTermMemory(10),
      longTermStore: longTerm,
      retrievalQuery: 'TypeScript',
    })

    expect(result.retrievedCount).toBe(1)
    const retrievedBlock = result.messages.find(
      m => m.role === 'system' && m.content.startsWith('[相关历史片段]'),
    )
    expect(retrievedBlock).toBeDefined()
    expect(retrievedBlock?.content).toContain('TypeScript')
    expect(retrievedBlock?.content).not.toContain('Rust')
  })

  it('没有 retrievalQuery 时不查长期记忆（即使配了 store）', async () => {
    const longTerm = new InMemoryLongTerm()
    await longTerm.add({
      id: 'l1',
      content: 'something',
      role: 'assistant',
      timestamp: Date.now(),
    })

    const result = await buildContext({
      systemPrompt: 'sys',
      shortTerm: new ShortTermMemory(10),
      longTermStore: longTerm,
      // no retrievalQuery
    })

    expect(result.retrievedCount).toBe(0)
    expect(result.messages.length).toBe(1) // 只有 system
  })

  it('budget 约束会触发裁剪，trimmedCount 反映丢了多少', async () => {
    const stm = new ShortTermMemory(50)
    const longContent = 'x'.repeat(400) // 每条约 100 token
    for (let i = 0; i < 10; i++) stm.add(longContent + i, 'user')

    const result = await buildContext({
      systemPrompt: 'sys',
      shortTerm: stm,
      budget: { maxTokens: 250 }, // 远小于 10 条
    })

    expect(result.trimmedCount).toBeGreaterThan(0)
    expect(result.tokensUsed).toBeLessThanOrEqual(250)
  })
})
