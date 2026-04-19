# Stage 3: RAG + LangChain.js — 检索增强生成 + 本地知识库问答

## 项目目标

1. 掌握 RAG（检索增强生成）技术栈
2. 文档解析与切片（Chunking）
3. Embeddings（文本向量化）
4. 向量数据库（Chroma）存储和检索
5. 构建本地代码库智能问答应用

## 快速开始

### 1. 安装依赖

```bash
cd ai-agent-study/stage3
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入 OPENAI_API_KEY
```

### 3. 启动 Chroma 数据库（Docker）

```bash
# Chroma 需要 Docker 运行
docker run -p 8000:8000 ghcr.io/chroma-core/chroma:latest
```

### 4. 导入代码库到知识库

```bash
# 导入整个项目
pnpm ingest /home/mikasa/project/geek-project

# 只导入特定类型的文件
pnpm ingest /home/mikasa/project/geek-project --include-extensions=ts,vue,js

# 排除特定目录
pnpm ingest /home/mikasa/project/geek-project --exclude-dirs=node_modules,dist
```

### 5. 启动服务器

```bash
pnpm dev
```

### 6. 测试问答

```bash
# 非流式
curl -X POST http://localhost:3001/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "这个项目的技术栈是什么？"}'

# 流式 SSE
curl -X POST http://localhost:3001/api/ask/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"question": "这个项目的技术栈是什么？"}'
```

## 项目结构

```
stage3/
├── src/
│   ├── chunking/
│   │   └── index.ts       # 文档解析 + 智能切片
│   ├── embeddings/
│   │   └── index.ts       # OpenAI Embeddings 封装
│   ├── vectorstore/
│   │   └── index.ts       # Chroma 向量数据库封装
│   ├── rag/
│   │   └── index.ts       # RAG 流水线
│   ├── server/
│   │   ├── index.ts        # HTTP 服务器
│   │   └── types.ts        # 共享类型
│   └── scripts/
│       └── ingest.ts       # 代码库导入脚本
├── package.json
├── tsconfig.json
└── .env.example
```

## 核心概念

### RAG 流程

```
用户问题
  │
  ▼
┌──────────────────┐
│  Embedding 查询   │  ← 将问题转为向量
└──────────────────┘
  │
  ▼
┌──────────────────┐
│  向量数据库检索   │  ← 找到最相关的文档块
└──────────────────┘
  │
  ▼
┌──────────────────┐
│  构建提示词       │  ← 将检索结果注入上下文
└──────────────────┘
  │
  ▼
┌──────────────────┐
│  LLM 生成回答     │  ← 基于上下文生成答案
└──────────────────┘
```

### Chunking 策略

- **代码文件**：按行切片（30行/块，5行重叠）
- **文本文件**：按字符切片（1000字符/块，100字符重叠）
- 每块添加文件类型前缀，帮助 LLM 理解上下文

### Embeddings 模型

使用 OpenAI `text-embedding-3-small`，支持 1536 维向量输出。

## 验证方式

1. 启动 Chroma: `docker run -p 8000:8000 ghcr.io/chroma-core/chroma:latest`
2. 导入代码库: `pnpm ingest /home/mikasa/project/geek-project`
3. 检查统计: `curl http://localhost:3001/api/stats`
4. 提问测试: `curl -X POST http://localhost:3001/api/ask -d '{"question": "..."}'`
