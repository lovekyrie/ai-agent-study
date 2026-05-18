import { Logger } from '@ai-agent-study/logger'
import { ShortTermMemory } from '@ai-agent-study/memory'

/**
 * Stage 05 占位 demo — 仅演示从 packages/memory 复用 ShortTermMemory。
 * 完整教学示例（token 预算、摘要压缩、Session）将在后续 commit 中补齐。
 */
async function main() {
  const logger = new Logger({ name: 'stage05-example', level: 'info' })

  const stm = new ShortTermMemory(10)
  for (let i = 0; i < 15; i++) {
    stm.add(`message ${i}`, 'user', { turn: i })
  }

  const recent = stm.getRecent(3)
  logger.info('短期记忆容量裁剪示例', {
    inserted: 15,
    kept: stm.size(),
    recentIds: recent.map((entry) => entry.id),
  })
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
