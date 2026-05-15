import * as fs from 'node:fs'
import * as path from 'node:path'
import { createLLMClient, type ChatMessage } from '@ai-agent-study/llm-client'
import { Logger } from '@ai-agent-study/logger'

const logger = new Logger({ name: 'code-explainer' })
// 字符数上限（非字节数），避免截断破坏 UTF-8 多字节字符
const MAX_FILE_CHARS = 50_000

function buildCodeExplainPrompt(filePath: string, content: string): ChatMessage[] {
  const ext = path.extname(filePath)
  return [
    {
      role: 'system',
      content: `你是一个专业的代码解释器。请详细解释用户提供的代码，包括：
1. 代码的整体功能和目的
2. 关键逻辑和核心数据结构
3. 重要的函数和方法
4. 代码的优点和潜在的改进建议

请用清晰、简洁的中文解释。`,
    },
    {
      role: 'user',
      content: `请解释以下 ${ext} 文件的代码：

\`\`\`${ext}
${content}
\`\`\``,
    },
  ]
}

export async function explainFile(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) {
    console.error(`文件不存在: ${filePath}`)
    process.exit(1)
  }

  const raw = fs.readFileSync(filePath, 'utf-8')
  const truncated = raw.length > MAX_FILE_CHARS
  const content = truncated ? raw.slice(0, MAX_FILE_CHARS) : raw
  const ext = path.extname(filePath)

  console.log(`\n正在分析: ${filePath} (${ext || '无扩展名'})\n`)
  console.log('-'.repeat(60))

  if (truncated) {
    console.warn(`文件较大（${raw.length} 字符），仅分析前 ${MAX_FILE_CHARS} 字符`)
  }

  try {
    const client = createLLMClient()
    const messages = buildCodeExplainPrompt(filePath, content)

    console.log('\nAI 解释：\n')

    let fullResponse = ''
    for await (const chunk of client.stream(messages, {
      temperature: 0.7,
      maxTokens: 2000,
    })) {
      if (!chunk.done) {
        process.stdout.write(chunk.delta)
        fullResponse += chunk.delta
      }
    }

    console.log('\n')
    console.log('-'.repeat(60))
    console.log('解释完成\n')
  } catch (error) {
    logger.error('Code explainer failed', error instanceof Error ? error : undefined)
    process.exit(1)
  }
}

export async function interactiveMode(): Promise<void> {
  const client = createLLMClient()
  const history: ChatMessage[] = [
    {
      role: 'system',
      content: '你是一个友好的代码助手，可以回答关于编程的各种问题。用中文回答。',
    },
  ]

  const readline = await import('node:readline/promises')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  console.log('进入交互模式，输入 quit 退出\n')

  try {
    while (true) {
      const question = (await rl.question('\n你 (输入 quit 退出): ')).trim()
      if (question.toLowerCase() === 'quit') break
      if (!question) continue

      history.push({ role: 'user', content: question })
      process.stdout.write('\nAI: ')

      let response = ''
      try {
        for await (const chunk of client.stream(history, { maxTokens: 1000 })) {
          if (!chunk.done) {
            process.stdout.write(chunk.delta)
            response += chunk.delta
          }
        }
        history.push({ role: 'assistant', content: response })
        process.stdout.write('\n')
      } catch (error) {
        // 失败时回滚 user message，避免污染下一轮上下文
        history.pop()
        console.error('\n错误:', error instanceof Error ? error.message : error)
      }
    }
  } finally {
    rl.close()
  }
}