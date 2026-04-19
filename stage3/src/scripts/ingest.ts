/**
 * 导入脚本 - 将本地代码库导入到知识库
 * 用法: pnpm ingest /path/to/codebase
 */

import { config } from 'dotenv';
import { processDirectory } from '../chunking/index.js';
import { VectorStore, createVectorStore } from '../vectorstore/index.js';
import * as path from 'path';

config();

// ==================== 解析参数 ====================

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
📚 知识库导入脚本

用法:
  pnpm ingest <directory> [options]

示例:
  pnpm ingest /home/mikasa/project/geek-project
  pnpm ingest ./src --include-extensions ts,vue,js
  pnpm ingest /path/to/project --exclude-dirs node_modules,dist

参数:
  directory           要导入的目录路径（必填）

选项:
  --include-extensions  只包含指定扩展名（如 ts,vue,js）
  --exclude-dirs        排除的目录（逗号分隔）
  --max-chunk-size      每块最大字符数（默认 1000）
  `);
  process.exit(0);
}

const directory = path.resolve(args[0]);

// 解析选项
const options: Record<string, string[]> = {
  includeExtensions: [],
  excludeDirs: [],
};

for (const arg of args.slice(1)) {
  if (arg.startsWith('--include-extensions=')) {
    options.includeExtensions = arg.split('=')[1].split(',');
  } else if (arg.startsWith('--exclude-dirs=')) {
    options.excludeDirs = arg.split('=')[1].split(',');
  }
}

// ==================== 执行导入 ====================

async function main(): Promise<void> {
  console.log(`\n📚 开始导入知识库`);
  console.log(`   目录: ${directory}`);
  console.log(`   扩展名: ${options.includeExtensions.length > 0 ? options.includeExtensions.join(', ') : '全部'}`);
  console.log(`   排除: ${options.excludeDirs.length > 0 ? options.excludeDirs.join(', ') : '无'}\n`);

  try {
    const vectorStore = createVectorStore();

    // 1. 处理目录，生成 chunks
    console.log('🔄 扫描和处理文件...');
    const chunks = await processDirectory(directory, {
      includeExtensions: options.includeExtensions.length > 0 ? options.includeExtensions : undefined,
      excludeDirs: options.excludeDirs.length > 0 ? options.excludeDirs : undefined,
    });

    if (chunks.length === 0) {
      console.log('\n⚠️  没有找到可处理的文件');
      return;
    }

    console.log(`\n📦 生成 ${chunks.length} 个文本块`);

    // 2. 清空旧数据
    console.log('🗑️  清空旧数据...');
    await vectorStore.clear();

    // 3. 导入新数据
    console.log('⬆️  导入到向量数据库...');
    await vectorStore.addChunks(chunks);

    // 4. 验证
    const stats = await vectorStore.getStats();
    console.log(`\n✅ 导入完成！`);
    console.log(`   Collection: ${stats.name}`);
    console.log(`   文档数: ${stats.count}`);

  } catch (error) {
    console.error('\n❌ 导入失败:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
