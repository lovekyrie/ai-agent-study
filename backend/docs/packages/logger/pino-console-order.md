# logger 与 console.log 输出顺序错乱

> 对应代码：[example.ts](../../../stages/stage02-prompt-context/src/example.ts)、[Logger](../../../packages/logger/src/index.ts)

## 现象

`runSection` 里先 `logger.info('--- 6. ... ---')`，再 `console.log(...)`，终端里却是 `console.log` 在前、带时间戳的 INFO 在后。

## 原因

两套输出通道不同步：

| 方式 | 路径 | 特点 |
|------|------|------|
| `logger.info` | pino → `pino-pretty` **worker transport** | 异步，有排队延迟 |
| `console.log` | 主线程直接写 stdout | 同步，立刻可见 |

执行顺序没问题，是**刷到终端的时机**不同。第 6、7 步几乎无 I/O，差异最明显；第 4、5 步流式输出会进一步打乱观感。

## 改法（示例脚本）

- 演示结果改用 `logger.info`，不要混 `console.log`
- 或开发时关掉 transport worker / 使用 `sync: true` 的 destination
- 或在 section 结束前 `await` pino flush（若启用）
