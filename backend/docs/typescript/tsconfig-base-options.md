# tsconfig.base.json 编译选项说明

> 对应文件：[tsconfig.base.json](../../tsconfig.base.json)

## 各选项含义

| 配置 | 含义 |
|------|------|
| `target: "ES2022"` | 编译输出的 JS 语言版本。越大语法越新，需匹配运行环境 Node 版本。 |
| `module: "NodeNext"` | 按 Node ESM/CJS 规则生成 `import`/`export`，与 `moduleResolution: NodeNext` 配套。 |
| `moduleResolution: "NodeNext"` | 类型检查时按 Node 16+ 规则解析模块（`exports`、扩展名等）。 |
| `lib: ["ES2022"]` | 内置 API 的类型范围（不含 DOM）。 |
| `strict: true` | 开启严格模式全家桶（空值检查、隐式 any 等）。 |
| `esModuleInterop: true` | 改善 CJS 与 ESM 互操作，如 `import fs from 'fs'`。 |
| `skipLibCheck: true` | 跳过 `.d.ts` 检查，加快编译；自有源码仍严格检查。 |
| `resolveJsonModule: true` | 允许 `import x from './a.json'`。 |
| `declaration: true` | 生成 `.d.ts` 供其他包引用。 |
| `declarationMap: true` | 为 `.d.ts` 生成 source map，便于跳转到源码。 |
| `sourceMap: true` | 为 `.js` 生成 source map，调试时对应 TS 行号。 |

## 在本仓库中的作用

- `NodeNext` + `ES2022`：各 package/stage 使用现代 Node ESM。
- `strict`：符合项目 TypeScript 严格模式规范。
- `declaration*` / `sourceMap`：workspace 包互相引用与本地调试。
