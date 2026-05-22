# zod 与 dotenv 在 loader 中的作用

> 对应文件：[packages/config/src/loader.ts](../../packages/config/src/loader.ts)、[schemas.ts](../../packages/config/src/schemas.ts)

## dotenv

**作用**：把项目根目录（或当前工作目录）的 `.env` 文件读进 `process.env`。

在 `loadConfig()` 开头调用：

```ts
dotenv.config()
```

之后 `getEnvString('OPENAI_API_KEY')` 等才能读到 `.env` 里的值。  
若不加载 dotenv，只有系统里已 export 的环境变量可用，本地开发通常要先 `cp .env.example .env`。

## zod

**作用**：运行时校验配置形状与约束，并生成 TypeScript 类型。

- **定义 schema**：在 `schemas.ts` 用 `z.object()` 描述 llm / database / security 等字段（类型、默认值、min/max、enum）。
- **loader 里校验**：`ConfigSchema.safeParse(rawConfig)`，失败则抛出可读错误列表。
- **loader 第 1 行**：`import type { z } from 'zod'` 仅用于类型——格式化错误时标注 `e: z.ZodIssue`，**不产生运行时 zod 代码**（`import type` 会被擦掉）。

## 二者分工

| 库 | 负责 |
|----|------|
| dotenv | 把 `.env` → `process.env` |
| 手写读取函数 | 从 `process.env` 拼成 `rawConfig` 对象 |
| zod (`ConfigSchema`) | 校验 + 默认值 + 导出 `Config` 类型 |

## 调用链

```
loadConfig()
  → dotenv.config()
  → 读 process.env 组装 rawConfig
  → ConfigSchema.safeParse(rawConfig)
  → 成功返回 Config，失败 throw
```

`getConfig()` 对结果做内存缓存，避免重复读 env。
