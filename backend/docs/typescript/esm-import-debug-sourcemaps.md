# import 写 `.js`、index  barrel、调试为何停在 `.ts`

> 对应：[packages/workspace/src/index.ts](../../packages/workspace/src/index.ts)、[packages/workspace/package.json](../../packages/workspace/package.json)、[tsconfig.base.json](../../tsconfig.base.json)

## 1. `index.ts` 不是多此一举

| 层级 | 文件 | 作用 |
|------|------|------|
| 模块 | `find-monorepo-root.ts` | `export function findMonorepoRoot` |
| 包入口 | `index.ts` | 对外 API：`import '@ai-agent-study/workspace'` |

`package.json` 入口指向 `dist/index.js`，外部不会自动加载 `find-monorepo-root.js`。  
`index.ts` 是 **barrel（聚合导出）**，与模块内 export 是两层概念。

## 2. 未 compile 时，`from './find-monorepo-root.js'` 能找到吗？

**类型检查 / tsc 编译：能。**

- 磁盘：`find-monorepo-root.ts`
- import 字符串：`'./find-monorepo-root.js'`（NodeNext 约定，对应编译产物名）
- **tsc 会把 `.js` 路径解析到同名 `.ts` 源码**，不要求 `src/` 里已有 `.js` 文件

**运行时 `import '@ai-agent-study/workspace'`：不能（未 build 时）。**

- 走 `package.json` → `dist/index.js`
- 无 dist → 报错（与 `index.ts` 里写 `.js` 无关）

## 3. 调试时为何断点打在 `.ts` 上？

import 写 `.js` ≠ 调试器只认 `.js`。两条路径：

### A. 直接跑源码（vitest / tsx / 相对路径 import）

```
loader.test → ../src/loader.js  → 实际加载 loader.ts
vitest alias → packages/workspace/src/index.ts
```

工具做 TS 模块解析，进程侧是转译后的代码，调试器显示 **`.ts` 源码**，通常 **不需要 source map**。

### B. 跑 dist（build 后，package 名 import）

```
@ai-agent-study/workspace → dist/index.js
```

进程执行 **`.js`**；`tsconfig` 中 `"sourceMap": true` 生成 `.js.map`，调试器把执行位置 **映射回 `src/*.ts`**。

| 场景 | 进程跑什么 | 调试器显示 |
|------|------------|------------|
| vitest/tsx 直跑 src | 转译后的 TS | `.ts` |
| dist + source map | `.js` | `.ts`（靠 map） |
| dist 无 map | `.js` | 只能看 `.js` |

## 4. 与「workspace 类型走 dist」的关系

- **同包内**相对 import `'./xxx.js'`：tsc/调试工具解析到 **src 的 .ts**
- **跨包** `import '@ai-agent-study/workspace'`：按 exports 找 **dist**；未 build 或 alias 未生效时会踩 dist 或报错

详见 [workspace 类型入口 dist](../packages/workspace-types-dist-entry.md)、[VS Code 调试与 vitest alias](../packages/config/vscode-debug-tasks-vitest-alias.md)。

## 一句话

源码 import 写 `.js` 是 **ESM + NodeNext 约定**；tsc/开发工具会解析到 `.ts`；调试停在 `.ts` 是因为 **直跑源码** 或 **source map 回映射**，不是因为 `src/` 里真有一个 `.js` 文件。

## 相关

- [为什么 import 写 `.js`](./esm-import-js-extension.md)
