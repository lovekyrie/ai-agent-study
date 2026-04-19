/**
 * 文档解析与切片 (Chunking)
 * 将长文本切分成适合大模型阅读的小段落
 */

import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';

// ==================== 类型定义 ====================

export interface Chunk {
  id: string;
  content: string;
  metadata: {
    source: string;
    filePath: string;
    chunkIndex: number;
    totalChunks: number;
  };
}

// ==================== 配置 ====================

export interface ChunkingConfig {
  /** 每块的最大字符数 */
  maxChunkSize?: number;
  /** 块之间的重叠字符数 */
  overlap?: number;
  /** 是否保留文件扩展名作为类型标记 */
  includeFileType?: boolean;
}

const defaultConfig: Required<ChunkingConfig> = {
  maxChunkSize: 1000,
  overlap: 100,
  includeFileType: true,
};

// ==================== 文档解析器 ====================

/**
 * 从文件路径读取内容
 */
function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * 判断是否为代码文件
 */
function isCodeFile(filePath: string): boolean {
  const codeExtensions = [
    '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c',
    '.go', '.rs', '.rb', '.php', '.cs', '.swift', '.kt', '.scala',
    '.vue', '.svelte', '.html', '.css', '.scss', '.less',
    '.json', '.yaml', '.yml', '.toml', '.xml', '.md', '.sql',
    '.sh', '.bash', '.zsh', '.ps1', '.dockerfile', '.makefile'
  ];
  const ext = path.extname(filePath).toLowerCase();
  return codeExtensions.includes(ext);
}

/**
 * 获取文件类型描述
 */
function getFileTypeDescription(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const typeMap: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'React TypeScript',
    '.js': 'JavaScript',
    '.jsx': 'React JavaScript',
    '.vue': 'Vue Component',
    '.py': 'Python',
    '.java': 'Java',
    '.go': 'Go',
    '.rs': 'Rust',
    '.md': 'Markdown',
    '.json': 'JSON',
    '.yaml': 'YAML',
    '.yml': 'YAML',
    '.sql': 'SQL',
    '.sh': 'Shell Script',
  };
  return typeMap[ext] ?? 'Unknown';
}

// ==================== 切片算法 ====================

/**
 * 按行切片（适合代码）
 */
export function chunkByLines(
  content: string,
  linesPerChunk: number = 30,
  overlapLines: number = 5
): string[] {
  const lines = content.split('\n');
  const chunks: string[] = [];

  let start = 0;
  while (start < lines.length) {
    const end = Math.min(start + linesPerChunk, lines.length);
    chunks.push(lines.slice(start, end).join('\n'));
    start += linesPerChunk - overlapLines;
    if (start >= lines.length) break;
    if (start + overlapLines >= lines.length) {
      chunks.push(lines.slice(start).join('\n'));
      break;
    }
  }

  return chunks;
}

/**
 * 按字符切片（通用）
 */
export function chunkByCharacters(
  content: string,
  maxSize: number,
  overlap: number
): string[] {
  if (content.length <= maxSize) {
    return [content];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < content.length) {
    const end = Math.min(start + maxSize, content.length);
    chunks.push(content.slice(start, end));
    start += maxSize - overlap;

    if (start >= content.length) break;
  }

  return chunks;
}

/**
 * 智能切片（代码优先按行，其他按字符）
 */
export function chunkContent(
  content: string,
  filePath: string,
  config: ChunkingConfig = {}
): Chunk[] {
  const cfg = { ...defaultConfig, ...config };
  const fileName = path.basename(filePath);
  const fileType = getFileTypeDescription(filePath);

  // 根据文件类型选择切片策略
  let texts: string[];
  if (isCodeFile(filePath)) {
    // 代码文件按行切片
    const linesPerChunk = Math.floor(cfg.maxChunkSize / 50); // 假设平均每行50字符
    texts = chunkByLines(content, linesPerChunk, Math.floor(linesPerChunk * 0.1));
  } else {
    // 文本文件按字符切片
    texts = chunkByCharacters(content, cfg.maxChunkSize, cfg.overlap);
  }

  // 添加文件类型前缀（帮助 LLM 理解上下文）
  if (cfg.includeFileType && texts.length > 0) {
    texts = texts.map((text, i) => {
      const header = `[${fileType}] ${fileName} (Part ${i + 1}/${texts.length}):\n`;
      return header + text;
    });
  }

  // 构建 Chunk 对象
  return texts.map((text, index) => ({
    id: `${fileName}-${index}`,
    content: text.trim(),
    metadata: {
      source: fileType,
      filePath,
      chunkIndex: index,
      totalChunks: texts.length,
    },
  }));
}

// ==================== 文件扫描 ====================

export interface FileFilter {
  /** 包含的扩展名 */
  includeExtensions?: string[];
  /** 排除的目录 */
  excludeDirs?: string[];
  /** 最大文件大小（字节） */
  maxFileSize?: number;
}

/**
 * 扫描目录下所有文件
 */
export async function scanDirectory(
  dirPath: string,
  filter: FileFilter = {}
): Promise<string[]> {
  const {
    includeExtensions,
    excludeDirs = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__'],
    maxFileSize = 500 * 1024, // 默认 500KB
  } = filter;

  const patterns: string[] = [];

  if (includeExtensions && includeExtensions.length > 0) {
    patterns.push(`**/*.${includeExtensions.join(', **/*.')}`);
  } else {
    patterns.push('**/*');
  }

  const files = await fg(patterns, {
    cwd: dirPath,
    absolute: true,
    ignore: excludeDirs.map(d => `**/${d}/**`),
    onlyFiles: true,
  });

  // 过滤文件大小
  return files.filter(file => {
    const stats = fs.statSync(file);
    return stats.size <= maxFileSize;
  });
}

// ==================== 主函数 ====================

/**
 * 扫描目录并切片所有文件
 */
export async function processDirectory(
  dirPath: string,
  filter: FileFilter = {},
  config: ChunkingConfig = {}
): Promise<Chunk[]> {
  const files = await scanDirectory(dirPath, filter);
  const allChunks: Chunk[] = [];

  console.log(`[Chunking] 找到 ${files.length} 个文件`);

  for (const file of files) {
    try {
      const content = readFile(file);
      const chunks = chunkContent(content, file, config);
      allChunks.push(...chunks);
    } catch (error) {
      console.warn(`[Chunking] 跳过文件 ${file}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`[Chunking] 生成 ${allChunks.length} 个文本块`);
  return allChunks;
}
