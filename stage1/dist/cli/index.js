/**
 * CLI 入口文件
 * 用法：
 *   npx tsx src/cli/index.ts ./some-file.ts    # 解释单个文件
 *   npx tsx src/cli/index.ts --interactive    # 交互模式
 */
import { explainFile, interactiveMode } from './code-explainer.js';
import * as path from 'path';
const args = process.argv.slice(2);
async function main() {
    if (args.length === 0) {
        printUsage();
        return;
    }
    const [firstArg] = args;
    if (firstArg === '--help' || firstArg === '-h') {
        printUsage();
        return;
    }
    if (firstArg === '--interactive' || firstArg === '-i') {
        await interactiveMode();
        return;
    }
    if (firstArg.startsWith('-')) {
        console.error(`❌ 未知参数: ${firstArg}`);
        printUsage();
        process.exit(1);
    }
    // 第一个参数作为文件路径
    const filePath = path.resolve(firstArg);
    await explainFile(filePath);
}
function printUsage() {
    console.log(`
🤖 AI 代码解释器

用法:
  npx tsx src/cli/index.ts <file>          解释指定文件
  npx tsx src/cli/index.ts --interactive   交互模式
  npx tsx src/cli/index.ts --help          显示帮助

示例:
  npx tsx src/cli/index.ts ./src/app.ts
  npx tsx src/cli/index.ts ./index.js
  `);
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map