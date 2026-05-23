# AI Agent 后端岗位扩展实施路线

这份路线承接现有 `stage00-11`，目标是把项目从“教学级 Agent 原理实现”升级为“可应聘后端 AI Agent 开发岗位的作品集”。

## 第一阶段：RAG 工程化

- `stage06A-data-ingestion`：文档加载、清洗、分块、hash、metadata、dedupe
- `stage06B-vector-db`：真实向量库 adapter，支持 Chroma 和内存 fallback
- `stage06C-hybrid-search`：BM25、weighted fusion、RRF、后续接 Elasticsearch

验收标准：

- 能索引真实目录或仓库
- 能追溯每个 chunk 的来源
- 能对比 vector / lexical / hybrid 检索效果

## 第二阶段：Agent 框架与工具生态

- `stage07A-langgraph-agentic-rag`：图状态 RAG，显式 plan/retrieve/grade/rewrite/answer
- `stage08A-mcp-ecosystem`：MCP tool bridge，统一注册进本地 ToolRegistry

验收标准：

- Agent 可以根据检索质量 rewrite query
- MCP tool 受本地权限、参数校验和审批控制

## 第三阶段：观测、评估、生产协议

- `stage10A-observability-evalops`：trace、usage summary、trace-to-eval、regression gate
- `stage11A-production-runtime`：Agent SSE event 协议、streaming runtime

验收标准：

- 一次 Agent run 可以看到 retrieval/tool/llm/workflow span
- 可以从 trace 生成 eval case
- 可以通过 SSE 返回 token、tool、retrieval、final events

## 第四阶段：GraphRAG 和项目升级

- `stage12-graph-rag`：内存 KnowledgeGraph，后续替换 Neo4j
- `projects/codebase-agent`：接真实 ingestion、hybrid retrieval、trace、eval
- `projects/enterprise-agent`：接 workflow streaming、MCP、approval、audit

验收标准：

- Codebase Agent 能索引真实仓库并给出文件引用
- Enterprise Agent 能展示多 Agent + RAG + MCP + 审批 + trace 的完整闭环
