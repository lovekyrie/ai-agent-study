# 根目录 pnpm install 与 workspace

> 对应文件：[pnpm-workspace.yaml](../../pnpm-workspace.yaml)、[package.json](../../package.json)

## 结论

在 monorepo **根目录**执行 `pnpm install`，会一次性处理 **workspace 内所有子包** 的依赖，**不需要**逐个进入 `packages/*`、`stages/*`、`projects/*` 再安装。

## 原理

1. **pnpm-workspace.yaml** 声明哪些目录是 workspace 成员（本仓库：`packages/*`、`stages/*`、`projects/*`）。
2. 根目录 `pnpm install` 会扫描这些成员各自的 `package.json`，汇总全部 `dependencies` / `devDependencies`。
3. 依赖写入**根目录** `pnpm-lock.yaml`，物理包放在根 `node_modules/.pnpm`（内容寻址 store）。
4. 各子包目录下通常只有指向 store 的**符号链接**，不是各自再下载一份。
5. workspace 内包若互相引用（如 `@ai-agent-study/llm-client`），pnpm 会链接到本地源码，而非从 npm 拉远程包。

## 何时需要单独操作

| 场景 | 命令 |
|------|------|
| 给某个子包**新增**依赖 | `pnpm --filter <包名> add axios` |
| 只跑某个子包脚本 | `pnpm --filter stage01-llm-api dev` |
| 全量构建/测试 | `pnpm -r run build` / 根目录 `pnpm test` |

> 可以看出只跑某个子包，只需要把对应workspace配置过的包即可，不需要加上外层文件夹名称

## 在本仓库中的作用

根 `package.json` 的 `build`、`test` 等脚本通过 `pnpm -r` / `pnpm --filter` 驱动子包；依赖安装只需根目录一次 `pnpm install` 即可。
