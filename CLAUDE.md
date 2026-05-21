# AI Agent Study 项目规则

## 项目结构

本项目采用 Monorepo 架构，使用 pnpm workspace 管理多个包和阶段项目。

## 开发规范

### 代码风格
- 使用 TypeScript 严格模式
- 遵循 ESLint 规则（@antfu/eslint-config，含格式化）
- 命名清晰胜过简短

### 提交信息
使用 Conventional Commits 格式：
- `feat:` 新功能
- `fix:` 修复 bug
- `refactor:` 重构
- `docs:` 文档
- `test:` 测试
- `chore:` 构建或辅助工具

### 测试
- 所有新代码必须有测试
- 单元测试覆盖率 > 80%
- 关键流程有集成测试

## 包管理

### 安装依赖
```bash
# 安装根依赖
pnpm install

# 安装特定包的依赖
pnpm --filter @ai-agent-study/llm-client install

# 安装新依赖到特定包
pnpm --filter @ai-agent-study/llm-client add axios
```

### 运行命令
```bash
# 在所有包中运行命令
pnpm -r test

# 在特定包中运行命令
pnpm --filter stage01-llm-api dev
```

## 环境变量

- 不要提交 .env 文件
- 所有敏感信息放在环境变量中
- 参考 .env.example 添加新配置

## Git 工作流

1. 从主分支创建功能分支
2. 提交代码（遵循 Conventional Commits）
3. 推送到远程
4. 创建 Pull Request
5. Code Review
6. 合并到主分支

## 禁止事项

- ❌ 提交 .env 文件
- ❌ 提交 node_modules
- ❌ 提交 dist / build 目录
- ❌ 强制推送到主分支
- ❌ 跳过测试直接提交
