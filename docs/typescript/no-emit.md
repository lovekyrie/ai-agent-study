# noEmit: true 是什么意思

> 对应文件：[tsconfig.json](../../tsconfig.json)（根目录）

## 含义

`noEmit: true` 表示 TypeScript **只做类型检查，不写出任何编译产物**（无 `.js`、`.d.ts`、`.map`）。

## 在本仓库中的角色

根 `tsconfig.json` 继承 `tsconfig.base.json`，并 `include` 整个 monorepo 的 `packages/*/src`、`stages/*/src` 等：

- **用途**：全仓库类型检查入口（`tsc -p tsconfig.json`）
- **不写文件**：避免与子包各自的 `outDir`/`dist` 冲突
- **真正构建**：各子包自己的 `tsconfig.json` + `pnpm build`

## 与 tsconfig.base 的关系

`tsconfig.base.json` 虽开启 `declaration`、`sourceMap`，但根配置加了 `noEmit: true` 后，**根级 tsc 只检查、不 emit**。

## 对比

| 配置 | 作用 |
|------|------|
| 根 `tsconfig.json` + `noEmit: true` | 全仓类型检查，不落盘 |
| 子包 `tsconfig.json`（如 `packages/config`） | 该包 `tsc` 构建时输出到 `dist/` |
