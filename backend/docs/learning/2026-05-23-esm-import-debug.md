# 2026-05-23 学习笔记：index barrel、.js import 与调试

## Q1: workspace 的 index.ts 是否多此一举？

**要点**：模块 export ≠ 包入口；`package.json` exports 指向 `index.js`，index.ts 是 barrel 聚合对外 API。

## Q2: 未 compile 时 `from './find-monorepo-root.js'` 能找到文件吗？

**要点**：tsc 会把 `.js` import 解析到同名 `.ts`；运行时包名 import 仍依赖 dist。

## Q3: 导出写 `.js`，调试为何能停在 `.ts`？

**要点**：开发工具 TS 解析直读源码；或 dist + sourceMap 映射回 src。不是 src 里真有 `.js` 文件。

**详文**：[../typescript/esm-import-debug-sourcemaps.md](../typescript/esm-import-debug-sourcemaps.md)
