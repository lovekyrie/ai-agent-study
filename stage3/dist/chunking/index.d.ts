/**
 * 文档解析与切片 (Chunking)
 * 将长文本切分成适合大模型阅读的小段落
 */
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
export interface ChunkingConfig {
    /** 每块的最大字符数 */
    maxChunkSize?: number;
    /** 块之间的重叠字符数 */
    overlap?: number;
    /** 是否保留文件扩展名作为类型标记 */
    includeFileType?: boolean;
}
/**
 * 按行切片（适合代码）
 */
export declare function chunkByLines(content: string, linesPerChunk?: number, overlapLines?: number): string[];
/**
 * 按字符切片（通用）
 */
export declare function chunkByCharacters(content: string, maxSize: number, overlap: number): string[];
/**
 * 智能切片（代码优先按行，其他按字符）
 */
export declare function chunkContent(content: string, filePath: string, config?: ChunkingConfig): Chunk[];
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
export declare function scanDirectory(dirPath: string, filter?: FileFilter): Promise<string[]>;
/**
 * 扫描目录并切片所有文件
 */
export declare function processDirectory(dirPath: string, filter?: FileFilter, config?: ChunkingConfig): Promise<Chunk[]>;
