# loadConfig 测试：单包通过、全量失败

> 对应文件：[packages/config/src/loader.ts](../../packages/config/src/loader.ts)、[packages/config/test/loader.test.ts](../../packages/config/test/loader.test.ts)

## 现象

- `pnpm --filter @ai-agent-study/config test`：`should throw error for invalid API key` 通过
- 根目录 `pnpm test`：同一用例失败，`loadConfig()` 未抛错

## 根因

1. 测试里 `delete process.env.OPENAI_API_KEY` 后调用 `loadConfig()`
2. `loadConfig()` **每次**都会执行 `dotenv.config()`（loader 第 41 行）
3. `dotenv` 默认**不覆盖**已存在的 env；但 key 被 **delete** 后视为不存在
4. 此时会从 `process.cwd()` 下的 `.env` **重新写入** `OPENAI_API_KEY`

| 运行方式 | 典型 cwd | 是否存在根 `.env` | delete 后 dotenv 行为 |
|----------|----------|-------------------|------------------------|
| `--filter config test` | `packages/config` | 通常无 | 读不到 key → 校验失败 → 抛错 ✓ |
| 根目录 `pnpm test` | 仓库根 | 有 `.env` | 从 `.env` 补回 key → 不抛错 ✗ |

## 本质

不是 Vitest「随机失败」，而是 **测试依赖 cwd + dotenv 副作用**，全量跑时工作目录不同导致行为不一致。

## 修复思路（任选）

1. **测试侧**：用 `process.env.OPENAI_API_KEY = ''` 代替 `delete`（空字符串 dotenv 不会覆盖，zod `min(1)` 仍会失败）
2. **测试侧**：`vi.spyOn(dotenv, 'config').mockImplementation(() => ({ parsed: {} }))`
3. **实现侧**：`loadConfig` 只在应用启动时 load 一次 dotenv，或测试环境跳过 `dotenv.config()`
4. **实现侧**：显式指定 env 路径（如 monorepo 根 `.env.test`），不依赖 cwd

## 相关

- `applyTestEnv()` 从 `.env.test` 注入；与 `loadConfig` 内的 `dotenv.config()` 是两条独立路径
- 全量测试时其他 stage 用例也可能受根 `.env` 影响，需注意 env 隔离
