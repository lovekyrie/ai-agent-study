/**
 * CLI 代码解释器
 * 读取本地文件内容，发送给 LLM，然后在终端流式输出解释
 */

import * as fs from 'fs';
import * as path from 'path';
import { LLMClient, createLLMClient, ChatMessage } from '../api/models.js';

const MAX_FILE_SIZE_BYTES = 50 * 1024;

/**
 * 构建代码解释的提示词
 */
function buildCodeExplainPrompt(filePath: string, content: string): ChatMessage[] {
  const ext = path.extname(filePath);
  return [
    {
      role: 'system',
      content: `你是一个专业的代码解释器。请详细解释用户提供的代码，包括：
1. 代码的整体功能和目的
2. 关键逻辑和数据结构
3. 重要的函数和方法
4. 代码的优点和潜在的改进建议

请用清晰、简洁的语言解释，适合有编程基础的开发者理解。`
    },
    {
      role: 'user',
      content: `请解释以下 ${ext} 文件的代码：

\`\`\`${ext}
${content}
\`\`\``
    }
  ];
}

/**
 * 流式输出到终端
 */
function streamToTerminal(emitter: ReturnType<LLMClient['streamChat']>): Promise<string> {
  return new Promise((resolve, reject) => {
    let fullResponse = '';

    emitter.on('chunk', (delta: string) => {
      process.stdout.write(delta);
      fullResponse += delta;
    });

    emitter.on('done', () => {
      process.stdout.write('\n');
      resolve(fullResponse);
    });

    emitter.on('error', (err: Error) => {
      reject(err);
    });
  });
}

/**
 * 主解释函数
 */
export async function explainFile(filePath: string): Promise<void> {
  // 验证文件是否存在
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 文件不存在: ${filePath}`);
    process.exit(1);
  }

  // 只读取前 MAX_FILE_SIZE_BYTES，避免超大文件占用过高内存
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');
  const bytesToRead = Math.min(stat.size, MAX_FILE_SIZE_BYTES);
  const buffer = Buffer.alloc(bytesToRead);
  fs.readSync(fd, buffer, 0, bytesToRead, 0);
  fs.closeSync(fd);
  const content = buffer.toString('utf-8');
  const ext = path.extname(filePath);

  console.log(`\n📄 正在分析: ${filePath} (${ext})\n`);
  console.log('─'.repeat(60));

  // 限制文件大小（最大 50KB）
  if (stat.size > MAX_FILE_SIZE_BYTES) {
    console.warn('⚠️ 文件较大，仅分析前 50KB');
  }
  const truncatedContent = content;

  try {
    const client = createLLMClient();
    const messages = buildCodeExplainPrompt(filePath, truncatedContent);

    console.log('\n🤖 AI 解释：\n');

    const emitter = client.streamChat(messages, {
      temperature: 0.7,
      maxTokens: 2000,
    });

    await streamToTerminal(emitter);

    console.log('─'.repeat(60));
    console.log('✅ 解释完成\n');

  } catch (error) {
    console.error('\n❌ 发生错误:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * 交互模式 - 持续对话
 */
export async function interactiveMode(): Promise<void> {
  const client = createLLMClient();
  const history: ChatMessage[] = [
    {
      role: 'system',
      content: '你是一个友好的代码助手，可以回答关于编程的各种问题。'
    }
  ];

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const askQuestion = (): void => {
    rl.question('\n💬 你 (输入 quit 退出): ', async (question) => {
      const normalizedQuestion = question.trim();
      if (normalizedQuestion.toLowerCase() === 'quit') {
        rl.close();
        return;
      }
      if (!normalizedQuestion) {
        askQuestion();
        return;
      }

      history.push({ role: 'user', content: normalizedQuestion });

      const emitter = client.streamChat(history, { maxTokens: 1000 });

      process.stdout.write('\n🤖 AI: ');
      let response = '';
      let settled = false;

      const settle = (handler: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        handler();
      };

      emitter.on('chunk', (delta: string) => {
        process.stdout.write(delta);
        response += delta;
      });

      emitter.on('done', () => {
        settle(() => {
          history.push({ role: 'assistant', content: response });
          process.stdout.write('\n');
          askQuestion();
        });
      });

      emitter.on('error', (err: Error) => {
        settle(() => {
          history.pop();
          console.error('\n❌ 错误:', err.message);
          askQuestion();
        });
      });
    });
  };

  console.log('🔄 进入交互模式，输入 quit 退出\n');
  askQuestion();
}
