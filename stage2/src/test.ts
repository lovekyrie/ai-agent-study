/**
 * 快速测试脚本 - 不启动服务器，直接测试 Agent
 * 用法: pnpm tsx src/test.ts
 */

import { Agent } from './agent/index.js';
import * as readline from 'readline';

async function main(): Promise<void> {
  console.log('🤖 Agent 测试 - 退出输入 quit\n');

  const agent = Agent.create();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = (): void => {
    rl.question('\n💬 你: ', async (question) => {
      if (question.toLowerCase() === 'quit') {
        rl.close();
        return;
      }

      try {
        process.stdout.write('\n🤖 Agent: ');
        const response = await agent.process(question);
        process.stdout.write(response.content);

        if (response.iterations > 1) {
          process.stdout.write(`\n   (用了 ${response.iterations} 轮完成)`);
        }
        process.stdout.write('\n');
      } catch (error) {
        console.error('\n❌ 错误:', error instanceof Error ? error.message : error);
      }

      ask();
    });
  };

  ask();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
