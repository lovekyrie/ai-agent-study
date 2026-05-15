# Stage 0: 工程基础

## 目标

建立规范的工程化基础，配置开发环境和工具链。

## 学习内容

### 1. Monorepo 架构
- pnpm workspace 配置
- 依赖管理策略
- 包之间的依赖关系

### 2. TypeScript 配置
- 严格模式
- 模块解析 (NodeNext)
- 类型声明

### 3. 代码质量工具
- ESLint 配置
- Prettier 格式化
- Git hooks (可选)

### 4. 测试框架
- Vitest 配置
- 单元测试
- 测试覆盖率

### 5. 日志系统
- 结构化日志 (pino)
- 日志级别
- 日志格式化

### 6. 配置管理
- 环境变量
- 配置校验
- 多环境支持

## 产出

- `packages/logger/` - 结构化日志系统
- `packages/config/` - 配置管理
- 统一的开发环境配置
- CI/CD 基础配置

## 验收标准

- [ ] pnpm install 成功
- [ ] pnpm test 运行通过
- [ ] pnpm lint 通过
- [ ] pnpm format 格式化代码
- [ ] 日志输出结构化
- [ ] 配置加载正确

## 快速开始

```bash
cd stages/stage0-engineering
pnpm install
pnpm test
```

## 下一步

完成阶段 0 后，进入 [阶段 1: LLM API 基础](../stage1-llm-api/README.md)