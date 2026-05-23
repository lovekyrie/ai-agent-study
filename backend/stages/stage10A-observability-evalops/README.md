# Stage 10A: Observability & EvalOps

把 trace 和 eval 串起来：每次 Agent run 都保留 LLM / tool / retrieval / workflow span，并能从成功 trace 生成 golden dataset。

## 核心能力

- run/span trace
- token、cost、latency 汇总
- trace → eval case
- regression gate

## 运行

```bash
pnpm --filter stage10a-observability-evalops test
pnpm --filter stage10a-observability-evalops dev
```

## 验收

- 能定位一次失败回答发生在哪个 span
- 能把真实 trace 转成 eval case
- 能用 pass rate 阈值阻断回归
