# 为什么没 build 时 typecheck 找不到 @ai-agent-study/*

> 对应文件：[packages/config/package.json](../../packages/config/package.json)、[tsconfig.json](../../tsconfig.json)、[vitest.config.ts](../../vitest.config.ts)

## 一句话

TypeScript 解析 `@ai-agent-study/config` 时，读的是 **package.json 里声明的类型入口** `./dist/index.d.ts`；没跑 `pnpm build` 就没有 `dist`，于是报 `Cannot find module`。

## 解析链路（根目录 `pnpm typecheck`）

```
stage00/src/example.ts
  import '@ai-agent-study/config'
       ↓
pnpm 软链 → packages/config/
       ↓
读 package.json exports.types → "./dist/index.d.ts"
       ↓
dist/index.d.ts 不存在 → TS2307
```

## package.json 里写了什么

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  }
}
```

- **运行时**（Node 执行）：找 `dist/index.js`
- **类型检查**（tsc）：找 `dist/index.d.ts`
- **源码**在 `src/`，但对外「官方入口」是 build 产物

`pnpm build` = 各包 `tsc` 把 `src/` 编译到 `dist/`，同时生成 `.d.ts`。

## 为什么 test 可以、typecheck 不行

| 工具 | 怎么解析 `@ai-agent-study/*` |
|------|------------------------------|
| Vitest | `vitest.config.ts` 的 **alias** 直接指向 `packages/*/src/index.ts` |
| 根 `tsc --noEmit` | 无 alias，走 **package.json exports** → 必须 `dist/*.d.ts` |

测试绕开了 dist；全局 typecheck 没有。

## 常见解法

1. **先 build 再 typecheck**（当前仓库做法）
2. 根 `tsconfig` 加 `paths` 开发期指向 `src`（与 Vitest 一致）
3. TypeScript **Project References** 分项目检查
4. `typecheck` 改为 `pnpm -r exec tsc --noEmit`（各包独立 tsconfig）

## 和「pnpm install 已链接源码」的区别

`pnpm install` 只是把 `packages/config` **链接**到 `node_modules/@ai-agent-study/config`；  
TypeScript 仍按该目录下 **package.json 的 exports** 找类型文件，不会自动用 `src/`。
