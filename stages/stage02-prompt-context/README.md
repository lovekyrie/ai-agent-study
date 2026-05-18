# Stage 2: Prompt Engineering + 上下文管理

## 目标

掌握可维护的提示词设计，而不是靠玄学调 prompt。

## 学习内容

### 1. 模板系统
- `{{变量}}` 插值渲染
- 数组展开 (tags: `{{tags}}`)
- 未定义变量保留原样

### 2. Few-shot Examples
- 输入-输出对示例
- 演示期望格式
- 提高模型理解

### 3. 输出格式约束
- JSON Schema 约束
- 系统提示词引导

### 4. 上下文裁剪
- 短期记忆窗口
- 摘要压缩策略
- 关键信息保留

### 5. Prompt 防护
- 输入清理
- 角色注入防护

## 产出

- `stages/stage02-prompt-context/`
- Prompt 测试用例集

## 快速开始

```bash
cd stages/stage02-prompt-context
pnpm install
pnpm dev
```

## 下一步

完成阶段 02 后，进入 [Stage 03: 工具调用](../stage03-tool-calling/README.md)