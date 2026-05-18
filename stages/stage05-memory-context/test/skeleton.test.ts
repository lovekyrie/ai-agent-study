import { describe, expect, it } from 'vitest'
import { STAGE05_STATUS, ShortTermMemory } from '../src/index.js'

describe('stage05 memory-context skeleton', () => {
  it('marks the stage as skeleton until learning materials land', () => {
    expect(STAGE05_STATUS).toBe('skeleton')
  })

  it('re-exports ShortTermMemory from @ai-agent-study/memory', () => {
    // 仅验证 re-export 工作 + 容量裁剪生效；
    // 具体保留策略由 packages/memory 测试覆盖，本阶段不重复断言。
    const stm = new ShortTermMemory(3)
    for (let i = 0; i < 5; i++) stm.add(`message-${i}`)

    expect(stm.size()).toBeLessThanOrEqual(3)
  })
})
