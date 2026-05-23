import type { EvalCase } from './types.js'

export class GoldenDataset {
  private cases: Map<string, EvalCase> = new Map()

  add(case_: EvalCase): void {
    this.cases.set(case_.id, case_)
  }

  get(id: string): EvalCase | undefined {
    return this.cases.get(id)
  }

  list(): EvalCase[] {
    return Array.from(this.cases.values())
  }

  listByCategory(category: EvalCase['category']): EvalCase[] {
    return this.list().filter(c => c.category === category)
  }

  size(): number {
    return this.cases.size
  }
}
