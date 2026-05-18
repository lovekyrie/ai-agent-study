# Stage 3: Function Calling / Tool Calling

## 目标

Agent 的核心不是聊天，而是"能调用工具完成任务"。

## 学习内容

### 1. Tool Schema 设计
- OpenAI function calling 格式
- Zod 参数校验
- 描述性文档

### 2. 工具执行器 Tool Registry
- 注册/注销工具
- 按类别组织
- 工具列表导出

### 3. 工具权限控制
- `requiresApproval` 标记
- 权限上下文
- 敏感操作拦截

### 4. 工具失败处理
- 参数校验失败
- 执行异常
- 友好错误消息

### 5. 并行工具调用
- 批量执行
- 结果聚合

## 内置工具

| 工具名 | 描述 | 类别 |
|--------|------|------|
| `read_file` | 读取本地文件 | filesystem |
| `http_request` | HTTP 请求 | network |
| `get_current_time` | 获取当前时间 | utility |
| `calculator` | 数学计算 | utility |
| `search_web` | 网络搜索 | network |

## 快速开始

```bash
cd stages/stage03-tool-calling
pnpm install
pnpm dev
```

## 下一步

完成阶段 03 后，进入 [Stage 04: Agent Runtime](../stage04-agent-runtime/README.md)