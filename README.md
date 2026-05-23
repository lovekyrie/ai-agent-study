# AI Agent Study

从基础到生产级的 AI Agent 系统完整学习项目。

## 项目目标

构建一个完整的 AI Agent 系统学习路径，最终能够：

- 开发生产级 AI Agent 后端服务
- 实现工具调用、RAG、记忆、工作流、MCP 集成
- 建立完整的评估体系和可观测性
- 完成 2 个可简历展示的完整项目

## 学习周期

16-24 周完成 12 个核心阶段 + 2 个综合项目；岗位级补强继续追加 8 个扩展阶段。

## 项目结构

```
ai-agent-study/
├── backend/
│   ├── apps/
│   │   └── api/                   # Hono API，前端唯一 LLM 调用入口
│   ├── packages/                  # 共享包（阶段产物的沉淀地）
│   │   ├── config/                # 配置管理
│   │   ├── logger/                # 结构化日志
│   │   ├── llm-client/            # LLM 客户端
│   │   ├── prompt/                # Prompt 模板
│   │   ├── tools/                 # 工具库
│   │   ├── memory/                # 记忆管理
│   │   ├── vectorstore/           # 向量存储
│   │   ├── retrieval/             # Loader / Splitter / Hybrid retrieval
│   │   ├── mcp/                   # MCP 客户端
│   │   ├── observability/         # Trace / EvalOps
│   │   └── server/                # Agent SSE API primitives
│   ├── stages/                    # 学习阶段（按序学习）
│   ├── projects/                  # 综合项目
│   └── docs/                      # 文档
├── frontend/                      # Vue + Vite LLM 调用展示端
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## 快速开始

### 环境要求

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Docker (用于 Chroma、PostgreSQL、Redis)

### 安装依赖

```bash
pnpm install
```

### 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入你的配置
```

### 运行测试

```bash
pnpm test
```

### 启动展示端

```bash
pnpm dev:backend
pnpm dev:frontend
```

后端默认监听 `http://localhost:3000`，前端默认监听 `http://localhost:5173`，前端通过相对路径 `/api/...` 访问后端。

### 构建所有包

```bash
pnpm build
```

## 学习路径

> **设计原则**：
>
> - **评估贯穿**：从 stage06 起每个阶段必须产出该阶段的评估输出（不是只在 stage10 才学评估）
> - **安全融入**：安全能力沉淀在 `backend/packages/tools`（工具审批）和 stage11（生产防护）；stage03/05 引入安全意识，不再有独立的「安全阶段」
> - **真实存储递进**：stage06→06B 接 Chroma、stage09 计划接 Postgres、stage11 接 Redis + OTel
> - **沉淀到 packages**：每个阶段的产出最终归位到 `backend/packages/*`，禁止重复造轮子

### Stage 00: 工程基础 (1-2 周)
建立规范的工程化基础，配置开发环境。

- Monorepo (pnpm workspace) / TypeScript 严格模式
- ESLint (antfu) + Vitest
- 结构化日志 (pino) / 配置管理

### Stage 01: LLM API 基础 (1-2 周)
掌握模型调用的底层机制，不只是复制 SDK 示例。

- Chat / Responses API、message 数组管理
- Streaming 流式输出（SSE）
- JSON 结构化输出、Schema 校验
- Retry / Timeout / Rate Limit
- 多模型适配层

### Stage 02: Prompt + 基础上下文 (1 周)
设计可维护的提示词；把模板系统沉淀到 `backend/packages/prompt`。

- 模板插值 + Few-shot examples
- 输出格式约束
- **基础上下文管理**（深度版在 stage05）
- 初步的 prompt injection 意识

### Stage 03: 工具调用（含工具安全）(2 周)
Agent 的核心能力，工具安全在此阶段就引入。

- Tool schema 设计 / Zod 参数校验
- Tool Registry / 类别管理
- **工具安全**：白名单、`requiresApproval` 审批流、并行执行隔离（沉淀在 `backend/packages/tools`）
- 失败重试、错误聚合

### Stage 04: Agent Runtime (2 周)
从「单轮工具调用」升级到「多步任务执行」。

- ReAct 循环（Reasoning / Action / Observation）
- Plan-Act-Observe 状态机
- 最大迭代控制 / abort 信号
- onStep 回调与执行 trace

### Stage 05: Memory & Context Engineering 🆕 (2 周)
让 Agent「记得住」：跨步骤、跨会话保留必要信息，又不被 token 撑爆。

- 短期记忆（滑窗 + importance 混合裁剪）
- 长期记忆抽象 + 实现（in-memory → vectorstore）
- Token 预算估算与上下文压缩
- LLM 摘要压缩 / Session 容器
- **上下文注入防护**（与 stage02/03 安全主题呼应）

### Stage 06: RAG 基础 + 基础评估 (2-3 周)
从「能检索」升级到「检索准确、可评估」。

- Chunking 策略（按段落 / 按行 / 按符号）
- Embedding 模型选择（含 OpenAI 真实接入选项）
- 基础 Rerank / Query Rewrite / Citation
- **基础评估指标**：命中率、Precision@k、Recall@k（评估在此阶段首次产出）

### Stage 07: Agentic RAG (2 周)
让 Agent 自己决定检索策略。复用 stage04 的 ReAct 思路，保持 stage 独立实现。

- RAG as Tool（Plan → Retrieve → Synthesize）
- 多知识库路由（MultiKnowledgeRouter）
- Keyword + Vector 混合检索（HybridSearchEngine）
- Research agent → 自动生成报告

### Stage 08: MCP (1-2 周)
掌握工具生态协议；建立「本地工具 ↔ 远端工具」的桥接。

- MCP 架构 / Server / Client
- Tools / Resources / Prompts
- stdio / HTTP transport
- 与 stage03 工具抽象对齐的桥接示例

### Stage 09: 多 Agent 工作流 (2 周)
确定性流程 + LLM 决策；状态可持久化。

- Workflow graph / Supervisor + Specialist
- Handoff 机制
- Checkpoint 与从断点恢复
- 真实持久化（计划接入 Postgres，当前 in-memory fallback）
- 人工审批节点

### Stage 10: 评估体系（系统化）(2 周)
把前面阶段已经用过的「轻量评估」整理升级。

- Golden dataset 管理
- LLM-as-judge / RAG metrics（Faithfulness 等）
- Tool calling eval（Precision / Recall / F1）
- 回归检测 / 成本与延迟统计

### Stage 11: 生产工程化 + 安全（融合）(2-3 周)
让项目像真实公司服务。**原 stage11-security 已融入本阶段的安全章节**。

- 真 JWT 鉴权 / 会话管理
- Postgres + Redis 真实接入
- BullMQ 任务队列
- OpenTelemetry tracing / metrics
- **安全模块**：输入净化、prompt/tool injection 检测、Sandbox、Allowlist/Denylist、敏感信息检测、审计日志（部分待实现）
- Docker Compose 一键启动（计划）

## 岗位级扩展路线

完成 stage00-11 后，继续按下面的扩展阶段补足真实岗位能力：

### Stage 06A: Data Ingestion
补齐 RAG ingestion 工程：Loader、Splitter、metadata、hash、dedupe、增量索引边界。

### Stage 06B: Vector DB
把内存检索升级为 `VectorStoreAdapter`，默认支持 in-memory fallback，并提供 Chroma adapter。

### Stage 06C: Hybrid Search
学习 BM25 / lexical retrieval / weighted fusion / RRF，为 Elasticsearch 接入打基础。

### Stage 07A: LangGraph Agentic RAG
用状态图方式实现 plan → retrieve → grade → rewrite → answer，后续可替换为 LangGraph。

### Stage 08A: MCP Ecosystem
把第三方 MCP tools 桥接进当前 `ToolRegistry`，统一审批、校验和错误处理。

### Stage 10A: Observability & EvalOps
补齐 run/span trace、token/cost/latency 统计、trace-to-eval 和 regression gate。

### Stage 11A: Production Runtime
定义 Agent SSE 事件协议，为 Fastify/NestJS 流式 API、队列、持久化和审计打基础。

### Stage 12: GraphRAG
实现实体/关系图谱、路径检索和 graph context，后续替换为 Neo4j。

## 综合项目

### Project A: AI Codebase Agent
建议在完成 **stage00–07** 后启动。智能代码库问答助手，复用 stage06 RAG + stage07 Agentic RAG + stage04 Agent。（目录已创建，待核心阶段完成后实现）

### Project B: Enterprise Workflow Agent
建议在完成 **stage00–11** 后启动。企业级工作流自动化，复用 stage09 Workflow + stage11 生产能力 + 安全模块。（目录已创建，待核心阶段完成后实现）

## 技术栈

- **语言**: TypeScript
- **运行时**: Node.js 20+
- **包管理**: pnpm (workspace)
- **测试**: Vitest
- **LLM**: OpenAI (gpt-4o, gpt-4o-mini)
- **向量数据库**: Chroma
- **关系数据库**: PostgreSQL
- **缓存**: Redis
- **队列**: BullMQ
- **日志**: pino
- **追踪**: OpenTelemetry

## 验收标准

以下为项目完成时的目标标准：

- 所有代码通过 ESLint
- TypeScript 严格模式
- 单元测试覆盖率 > 80%
- Docker Compose 一键启动
- 完整的文档和部署指南

## License

MIT
