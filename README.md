# AI Agent Study

从基础到生产级的 AI Agent 系统完整学习项目。

## 项目目标

构建一个完整的 AI Agent 系统学习路径，最终能够：

- 开发生产级 AI Agent 后端服务
- 实现工具调用、RAG、记忆、工作流、MCP 集成
- 建立完整的评估体系和可观测性
- 完成 2 个可简历展示的完整项目

## 学习周期

16-24 周，分为 12 个阶段 + 2 个简历项目。

## 项目结构

```
ai-agent-study/
├── packages/                   # 共享包
│   ├── llm-client/            # LLM 客户端
│   ├── tools/                 # 工具库
│   ├── memory/                # 记忆管理
│   ├── vectorstore/           # 向量数据库
│   ├── prompt/                # Prompt 模板
│   ├── mcp/                   # MCP 客户端
│   ├── logger/                # 日志系统
│   └── config/                # 配置管理
├── stages/                     # 学习阶段
│   ├── stage0-engineering/    # 工程基础
│   ├── stage1-llm-api/        # LLM API 基础
│   ├── stage2-prompt-context/ # Prompt + 上下文
│   ├── stage3-tool-calling/   # 工具调用
│   ├── stage4-agent-runtime/  # Agent Runtime
│   ├── stage5-advanced-rag/   # 高级 RAG
│   ├── stage6-agentic-rag/    # Agentic RAG
│   ├── stage7-mcp/            # MCP 集成
│   ├── stage8-workflow/       # 多 Agent 工作流
│   ├── stage9-evals/          # 评估体系
│   ├── stage10-production/    # 生产工程化
│   └── stage11-security/      # 安全与权限
├── projects/                   # 简历项目
│   ├── codebase-agent/        # AI Codebase Agent
│   └── enterprise-agent/      # Enterprise Workflow Agent
└── docs/                       # 文档
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

### 构建所有包

```bash
pnpm build
```

## 学习路径

### 阶段 0: 工程基础 (1-2 周)
建立规范的工程化基础，配置开发环境。

**学习内容**:
- Monorepo 架构 (pnpm workspace)
- TypeScript 严格模式
- ESLint + Prettier
- Vitest 测试框架
- 结构化日志

### 阶段 1: LLM API 基础 (1-2 周)
掌握模型调用的底层机制。

**学习内容**:
- Chat / Responses API
- Streaming 流式输出
- JSON 结构化输出
- Retry、Timeout、Rate Limit
- 多模型适配层

### 阶段 2: Prompt + 上下文 (1 周)
设计可维护的提示词。

**学习内容**:
- Prompt 模板系统
- Few-shot examples
- 上下文裁剪、摘要
- Prompt injection 防护

### 阶段 3: 工具调用 (2 周)
Agent 的核心能力 - 调用工具完成任务。

**学习内容**:
- Tool schema 设计
- 参数校验 (Zod)
- Tool Registry
- 权限控制
- 失败重试、并行调用

### 阶段 4: Agent Runtime (2 周)
从"单轮工具调用"升级到"多步任务执行"。

**学习内容**:
- ReAct 思路
- Plan-Act-Observe 循环
- 任务分解
- Self-reflection
- 人工确认

### 阶段 5: 高级 RAG (2-3 周)
从"能检索"升级到"检索准确、可评估"。

**学习内容**:
- Chunking 策略
- Embedding 模型选择
- Hybrid search、Rerank
- Metadata filter
- Query rewrite
- Citation

### 阶段 6: Agentic RAG (2 周)
让 Agent 自己决定检索策略。

**学习内容**:
- RAG as Tool
- 多知识库路由
- SQL + Vector 混合
- Research agent
- Report generation

### 阶段 7: MCP (1-2 周)
掌握工具生态协议。

**学习内容**:
- MCP 架构
- MCP Server / Client
- Tools / Resources / Prompts
- 权限、安全

### 阶段 8: 多 Agent 工作流 (2 周)
确定性流程 + LLM 决策。

**学习内容**:
- Workflow graph
- Supervisor agent
- Specialist agents
- Handoff
- Durable execution

### 阶段 9: 评估体系 (2 周)
数据驱动的质量保证。

**学习内容**:
- Golden dataset
- LLM-as-judge
- RAG metrics
- Tool calling eval
- 成本、延迟统计

### 阶段 10: 生产工程化 (2-3 周)
让项目像真实公司服务。

**学习内容**:
- API 鉴权
- 用户会话
- PostgreSQL + Redis
- 队列 (BullMQ)
- OpenTelemetry tracing
- Docker 部署

### 阶段 11: 安全与权限 (1-2 周)
生产级安全边界。

**学习内容**:
- Prompt injection 防护
- Tool injection 防护
- Sandbox 机制
- Allowlist / Denylist
- 审计日志

## 简历项目

### 项目 A: AI Codebase Agent
智能代码库问答助手，支持代码导入、RAG 问答、代码定位、GitHub MCP 集成。

### 项目 B: Enterprise Workflow Agent
企业级工作流自动化，支持多 Agent 协作、人工审批、评估报告。

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

- 所有代码通过 ESLint + Prettier
- TypeScript 严格模式
- 单元测试覆盖率 > 80%
- Docker Compose 一键启动
- 完整的文档和部署指南

## License

MIT