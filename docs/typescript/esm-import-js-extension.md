# 为什么 import 写 `.js` 而不是 `.ts`

> 示例：[packages/config/src/loader.ts](../../packages/config/src/loader.ts)

```ts
import type { Config } from './schemas.js'
import { ConfigSchema } from './schemas.js'
```

## 原因

1. **`package.json` 有 `"type": "module"`** — 按 Node ESM 运行。
2. **`moduleResolution: "NodeNext"`** — import 路径按 **运行时** 解析。
3. **编译后是 `.js`** — `schemas.ts` → `dist/schemas.js`，Node 执行的是 `./schemas.js`。
4. **TS 约定** — 源码写 `.js`，类型检查仍读 `schemas.ts`；编译后路径不变。

若写成 `./schemas.ts` 或省略扩展名，在原生 Node ESM 下常无法解析。

## 和旧习惯的区别

| 环境 | 常见写法 |
|------|----------|
| CJS / Bundler | `from './schemas'` 可省略扩展名 |
| Node ESM + NodeNext | 显式 `from './schemas.js'` |

## 一句话

源码是 `.ts`，import 写 `.js`，是为了与 **Node ESM 运行时** 一致，不是笔误。
