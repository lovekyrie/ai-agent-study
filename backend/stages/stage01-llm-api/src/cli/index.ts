import * as path from 'node:path'
import { explainFile, interactiveMode } from './code-explainer.js'

const args = process.argv.slice(2)

async function main(): Promise<void> {
  if (args.length === 0) {
    printUsage()
    return
  }

  const [firstArg] = args

  if (firstArg === '--help' || firstArg === '-h') {
    printUsage()
    return
  }

  if (firstArg === '--interactive' || firstArg === '-i') {
    await interactiveMode()
    return
  }

  if (firstArg.startsWith('-')) {
    console.error(`未知参数: ${firstArg}`)
    printUsage()
    process.exit(1)
  }

  const filePath = path.resolve(firstArg)
  await explainFile(filePath)
}

function printUsage(): void {
  console.log(`
AI 代码解释器

用法:
  npx tsx src/cli/index.ts <文件路径>           解释指定文件
  npx tsx src/cli/index.ts --interactive       交互模式
  npx tsx src/cli/index.ts --help              显示帮助

示例:
  pnpm cli ./src/example.ts
  pnpm cli --interactive
  `)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
