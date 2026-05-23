import { evaluateRegression, runObservedAnswer } from './index.js'

const observed = await runObservedAnswer('what is rag?', async () => 'retrieval augmented generation')
console.log(observed.tracer.summarizeRun(observed.run?.id ?? 'missing'))
console.log(evaluateRegression({ baselinePassRate: 0.92, currentPassRate: 0.9 }))
