/**
 * HTTP 服务器 - 基于知识库的问答服务
 */

import express, { Request, Response } from 'express';
import { config } from 'dotenv';
import { RAGPipeline } from '../rag/index.js';
import { VectorStore } from '../vectorstore/index.js';
import { createEmbeddingsClient } from '../embeddings/index.js';
import { processDirectory } from '../chunking/index.js';
import * as path from 'path';

config();

const app = express();
app.use(express.json());

// ==================== 初始化 ====================

let ragPipeline: RAGPipeline;
let vectorStore: VectorStore;

try {
  ragPipeline = RAGPipeline.create();
  vectorStore = createVectorStore();
  console.log('[Server] RAG Pipeline initialized');
} catch (error) {
  console.error('[Server] Failed to initialize RAG:', error);
  process.exit(1);
}

// ==================== 辅助函数 ====================

function createVectorStore(): VectorStore {
  const embeddings = createEmbeddingsClient();
  const persistDir = process.env.CHROMA_PATH ?? './data/chroma';
  return new VectorStore(embeddings, {
    persistDirectory: persistDir,
    collectionName: 'knowledge-base',
  });
}

// ==================== API 路由 ====================

/**
 * POST /api/ingest - 导入代码库到知识库
 */
app.post('/api/ingest', async (req: Request, res: Response) => {
  const { directory, filter } = req.body as {
    directory: string;
    filter?: {
      includeExtensions?: string[];
      excludeDirs?: string[];
    };
  };

  if (!directory) {
    res.status(400).json({ error: 'directory is required' });
    return;
  }

  try {
    console.log(`[Server] Ingesting directory: ${directory}`);

    // 处理目录，生成 chunks
    const chunks = await processDirectory(directory, filter ?? {});

    if (chunks.length === 0) {
      res.json({ message: 'No files to ingest', chunksCount: 0 });
      return;
    }

    // 清空旧数据
    await vectorStore.clear();

    // 添加到向量库
    await vectorStore.addChunks(chunks);

    res.json({
      message: 'Ingestion complete',
      chunksCount: chunks.length,
    });
  } catch (error) {
    console.error('[Server] Ingestion error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Ingestion failed'
    });
  }
});

/**
 * POST /api/ask - 问答（非流式）
 */
app.post('/api/ask', async (req: Request, res: Response) => {
  const { question } = req.body as { question: string };

  if (!question) {
    res.status(400).json({ error: 'question is required' });
    return;
  }

  try {
    const answer = await ragPipeline.ask(question);

    res.json({
      answer: answer.answer,
      sources: answer.sources.map(s => ({
        id: s.id,
        content: s.content.slice(0, 200) + (s.content.length > 200 ? '...' : ''),
        metadata: s.metadata,
        distance: s.distance,
      })),
      retrievalQuery: answer.retrievalQuery,
    });
  } catch (error) {
    console.error('[Server] Ask error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Ask failed'
    });
  }
});

/**
 * POST /api/ask/stream - 问答（流式，SSE）
 */
app.post('/api/ask/stream', async (req: Request, res: Response) => {
  const { question } = req.body as { question: string };

  if (!question) {
    res.status(400).json({ error: 'question is required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const result = await ragPipeline.askStream(question, (delta) => {
      res.write(`event: chunk\ndata: ${JSON.stringify({ delta })}\n\n`);
    });

    // 发送 sources
    res.write(`event: sources\ndata: ${JSON.stringify({ sources: result.sources })}\n\n`);
    res.end();
  } catch (error) {
    console.error('[Server] Stream error:', error);
    res.write(`event: error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Error' })}\n\n`);
    res.end();
  }
});

/**
 * GET /api/stats - 获取知识库统计
 */
app.get('/api/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await vectorStore.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get stats'
    });
  }
});

// ==================== 启动 ====================

const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║                                                      ║
║   🤖 RAG Knowledge Base Server (Stage 3)            ║
║                                                      ║
║   HTTP Server:  http://localhost:${PORT}               ║
║                                                      ║
║   Endpoints:                                         ║
║     POST /api/ingest      - 导入代码库到知识库        ║
║     POST /api/ask         - 问答 (非流式)            ║
║     POST /api/ask/stream  - 问答 (流式 SSE)          ║
║     GET  /api/stats      - 知识库统计                ║
║                                                      ║
║   Usage:                                             ║
║     1. POST /api/ingest with {"directory": "/path"}  ║
║     2. POST /api/ask with {"question": "..."}        ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
  `);
});
