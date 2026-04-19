# Stage 2: Function Calling + Memory Management

## 项目目标

1. 实现 Function Calling（工具调用）
2. 实现短期记忆 + 长期记忆管理
3. 构建带工具调用能力的 Agent
4. 提供网页对话服务器

## 快速开始

### 1. 安装依赖

```bash
cd ai-agent-study/stage2
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入 OPENAI_API_KEY
```

### 3. 测试 Agent

```bash
# 不启动服务器，直接测试 Agent
pnpm tsx src/test.ts

# 示例问题：
# - "今天有什么新闻？" -> 会调用 search_web
# - "现在几点了？" -> 会调用 get_current_time
# - "帮我读取 /path/to/file.txt" -> 会调用 read_local_file
```

### 4. 启动 HTTP 服务器

```bash
pnpm dev
```

## API 接口

### POST /api/chat（非流式）

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "今天有什么新闻？"}'
```

响应：
```json
{
  "sessionId": "uuid",
  "content": "让我帮你搜索...",
  "iterations": 2
}
```

### POST /api/chat/stream（流式 SSE）

```bash
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message": "今天有什么新闻？"}'
```

SSE 事件：
- `session` - 返回 sessionId
- `chunk` - 流式输出片段
- `done` - 完成
- `error` - 错误

## 项目结构

```
stage2/
├── src/
│   ├── api/
│   │   ├── types.ts     # 共享类型定义
│   │   └── llm.ts       # LLM 客户端
│   ├── tools/
│   │   └── index.ts     # 工具定义和执行
│   ├── memory/
│   │   └── index.ts     # 短期/长期记忆管理
│   ├── agent/
│   │   └── index.ts     # Agent 核心逻辑
│   ├── server/
│   │   └── index.ts     # Express HTTP 服务器
│   └── test.ts          # 快速测试脚本
├── package.json
├── tsconfig.json
└── .env.example
```

## 核心概念

### Function Calling

Agent 可以调用的工具：
- `search_web` - 搜索网络
- `read_local_file` - 读取本地文件
- `get_current_time` - 获取当前时间

### Agent Loop

```
用户输入
  -> LLM 判断是否需要工具
    -> 如果需要：执行工具 -> 把结果返回 LLM -> 继续判断
    -> 如果不需要：返回回答
```

### 记忆管理

- **短期记忆**：数组维护最近 N 轮对话
- **长期记忆**：向量数据库接口（当前为简单实现，可接入 Chroma）

## 验证方式

1. 启动服务器后，访问 http://localhost:3000/api/tools 查看可用工具
2. 发送"今天有什么新闻？"测试工具调用
3. Agent 会自动调用 `search_web` 工具并返回结果
