# VS Code 调试：tasks.json 与 vitest alias / dist

> 对应文件：[.vscode/tasks.json](../../.vscode/tasks.json)、[.vscode/launch.json](../../.vscode/launch.json)、[vitest.config.ts](../../vitest.config.ts)

## tasks.json 是干什么的

定义 **预任务**（preLaunchTask），在调试启动前自动执行的 shell 命令。

当前任务 `build: config + workspace`：

```bash
pnpm --filter @ai-agent-study/workspace build && pnpm --filter @ai-agent-study/config build
```

作用：把 workspace、config 的 **src 编译到 dist**，并生成 `.d.ts` 与 source map。

## launch.json 与 tasks 的绑定关系

| 调试配置 | preLaunchTask | 调试前是否 build |
|----------|---------------|------------------|
| Debug: config loader (vitest) | **无** | 否 |
| Debug: stage00 dev | build: config + workspace | 是 |
| Debug: config loader (tsx 直跑) | build: config + workspace | 是 |

**重要**：只有写了 `"preLaunchTask": "build: config + workspace"` 的配置才会先跑 tasks.json。  
**vitest 那条不会自动触发 tasks.json**（除非手动跑任务或改过 launch 配置）。

## 为什么 vitest 调试时仍可能「看到 dist」

调试链路分两段，来源不同：

```
loader.test.ts
  └─ import '../src/loader.js'     → config 源码 (src) ✓
       └─ import '@ai-agent-study/workspace'
            └─ 有 alias → packages/workspace/src
            └─ 无 alias → package.json exports → packages/workspace/dist ✗
```

### 1. config 自身：走 src

`packages/config/test/loader.test.ts` 相对路径引用 `../src/loader.js`，**不经过** `@ai-agent-study/config` 包名，断点打在 `loader.ts` 是源码。

### 2. workspace 依赖：可能走 dist

`loader.ts` 里 `import { findMonorepoRoot } from '@ai-agent-study/workspace'` 走 **包名解析**：

- 根目录 `vitest.config.ts` 的 **alias 生效** → 指向 `packages/workspace/src`
- **alias 未生效** → 读 `package.json` 的 `"types": "./dist/index.d.ts"` → **dist**

### 3. alias 为何在子包 cwd 下容易失效

当前 vitest 调试配置：

```json
"cwd": "${workspaceFolder}/packages/config"
```

在 `packages/config` 下启动 vitest 时，Vitest 的 **project root** 常落在子包目录；若未显式指定 `--config` 指向仓库根 `vitest.config.ts`，根配置的 `resolve.alias` **可能不会被加载**，`@ai-agent-study/workspace` 就会回落到 **dist**。

这与 tasks.json **无直接因果关系**；dist 存在是因为之前 build 过，或 pnpm 按 exports 解析到 dist。

### 4. tasks.json 间接影响

vitest 配置本身**不会**因 tasks 而改 alias。但若：

- 你用的是 **带 preLaunchTask** 的调试项，或
- 手动跑过 build，

则 dist 更新/存在，在 alias 失效时更容易「踩进 dist 文件」。

## 推荐：让 vitest 调试稳定走 src

在 `Debug: config loader (vitest)` 的 `runtimeArgs` 增加：

```json
"--config",
"${workspaceFolder}/vitest.config.ts"
```

强制使用根 vitest 配置，alias 对 `@ai-agent-study/workspace` 等包生效。

## 小结

| 现象 | 原因 |
|------|------|
| tasks.json 用途 | 调试前自动 build（仅绑定了 preLaunchTask 的配置） |
| vitest 调试仍见 dist | 包名 import 未命中 alias → exports 指向 dist |
| 不是 tasks 默认先跑 vitest | vitest 调试项 **没有** preLaunchTask |
| config loader 断点 | `loader.ts` 本身是 src；跟进 workspace 时可能进 dist |
