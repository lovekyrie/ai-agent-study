import type { EvalSuite, RegressionReport } from './types.js'

export class RegressionTracker {
  private history: EvalSuite[] = []

  add(suite: EvalSuite): void {
    this.history.push(suite)
  }

  getHistory(): EvalSuite[] {
    return [...this.history]
  }

  getLatest(): EvalSuite | undefined {
    return this.history.at(-1)
  }

  compare(baseline: EvalSuite, current: EvalSuite): RegressionReport {
    const delta = {
      passRate: current.summary.passRate - baseline.summary.passRate,
      avgLatency: current.summary.avgLatencyMs - baseline.summary.avgLatencyMs,
      cost: current.summary.totalCost - baseline.summary.totalCost,
    }

    const regressions: string[] = []
    if (delta.passRate < -0.1)
      regressions.push('Pass rate dropped significantly')
    if (delta.avgLatency > 1000)
      regressions.push('Latency increased by >1s')

    return {
      baseline: baseline.timestamp,
      current: current.timestamp,
      delta,
      hasRegression: delta.passRate < -0.05 || regressions.length > 0,
      regressions,
    }
  }
}

export class CostTracker {
  private requests: { timestamp: Date, inputTokens: number, outputTokens: number, model: string }[] = []

  record(inputTokens: number, outputTokens: number, model: string): void {
    this.requests.push({ timestamp: new Date(), inputTokens, outputTokens, model })
  }

  getTotal(): { inputTokens: number, outputTokens: number, estimatedCost: number } {
    const totals = this.requests.reduce(
      (acc, r) => ({
        inputTokens: acc.inputTokens + r.inputTokens,
        outputTokens: acc.outputTokens + r.outputTokens,
      }),
      { inputTokens: 0, outputTokens: 0 },
    )

    return {
      ...totals,
      estimatedCost: this.calculateCost(totals.inputTokens, totals.outputTokens),
    }
  }

  getByModel(): Record<string, { requests: number, inputTokens: number, outputTokens: number, cost: number }> {
    const byModel: Record<string, { requests: number, inputTokens: number, outputTokens: number, cost: number }> = {}

    for (const req of this.requests) {
      if (!byModel[req.model]) {
        byModel[req.model] = { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 }
      }
      byModel[req.model].requests++
      byModel[req.model].inputTokens += req.inputTokens
      byModel[req.model].outputTokens += req.outputTokens
      byModel[req.model].cost += this.calculateCost(req.inputTokens, req.outputTokens)
    }

    return byModel
  }

  private calculateCost(inputTokens: number, outputTokens: number): number {
    const INPUT_COST_PER_1K = 0.00015
    const OUTPUT_COST_PER_1K = 0.0006
    return (inputTokens / 1000) * INPUT_COST_PER_1K + (outputTokens / 1000) * OUTPUT_COST_PER_1K
  }
}
