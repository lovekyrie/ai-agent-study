import { createLLMClient, type LLMClient } from '@ai-agent-study/llm-client'
import type {
  EvalExpected,
  EvalOutput,
  LLMJudgeConfig,
  RAGMetrics,
  ToolCall,
  ToolCallingEvalResult,
} from './types.js'

export class RuleBasedEvaluator {
  evaluate(output: EvalOutput, expected: EvalExpected): { passed: boolean; score: number; details: string } {
    let score = 1.0
    const reasons: string[] = []
    let hardFailure = false

    if (expected.contains) {
      const found = expected.contains.filter((term) =>
        output.content.toLowerCase().includes(term.toLowerCase()),
      )
      const missing = expected.contains.filter((term) => !found.includes(term))
      if (missing.length === 0) {
        reasons.push('All required terms found')
      } else {
        const ratio = expected.contains.length > 0 ? found.length / expected.contains.length : 1
        score = Math.min(score, ratio)
        hardFailure = true
        reasons.push(`Missing required terms: ${missing.join(', ')}`)
      }
    }

    if (expected.pattern) {
      if (expected.pattern.test(output.content)) {
        reasons.push('Pattern matched')
      } else {
        score -= 0.5
        hardFailure = true
        reasons.push('Pattern not matched')
      }
    }

    if (expected.minScore !== undefined && output.metadata?.score !== undefined) {
      const scoreVal = typeof output.metadata.score === 'number' ? output.metadata.score : 0
      if (scoreVal >= expected.minScore) {
        reasons.push(`Score ${scoreVal} >= ${expected.minScore}`)
      } else {
        score -= (expected.minScore - scoreVal)
        hardFailure = true
        reasons.push(`Score ${scoreVal} < ${expected.minScore}`)
      }
    }

    if (expected.custom) {
      const customResult = expected.custom(output, expected)
      if (customResult) {
        reasons.push('Custom validation passed')
      } else {
        score = 0
        hardFailure = true
        reasons.push('Custom validation failed')
      }
    }

    const normalizedScore = Math.max(0, Math.min(1, score))
    const passed = !hardFailure && normalizedScore >= 0.5
    return {
      passed,
      score: normalizedScore,
      details: reasons.join('; ') || 'No specific checks',
    }
  }
}

export class LLMJudge {
  private cachedClient?: LLMClient
  private config: LLMJudgeConfig

  constructor(config: LLMJudgeConfig = {}, llmClient?: LLMClient) {
    this.config = { temperature: 0, ...config }
    this.cachedClient = llmClient
  }

  private getClient(): LLMClient {
    if (!this.cachedClient) this.cachedClient = createLLMClient()
    return this.cachedClient
  }

  async judge(
    question: string,
    answer: string,
    criteria: string = 'Is the answer helpful, accurate, and relevant to the question?',
  ): Promise<{ score: number; reasoning: string }> {
    const prompt = `You are an expert evaluator. Judge the following answer based on the given criteria.

Question: ${question}

Answer: ${answer}

Criteria: ${criteria}

Provide your evaluation in JSON format:
{
  "score": <number 0-1>,
  "reasoning": "<brief explanation>"
}`

    try {
      const response = await this.getClient().chat([
        { role: 'system', content: 'You are a fair and strict evaluator. Respond only with valid JSON.' },
        { role: 'user', content: prompt },
      ], { jsonMode: true, temperature: this.config.temperature ?? 0, maxTokens: 500 })

      const parsed = this.parseJSON(response.content)
      const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning provided'
      return {
        score: clampScore(parsed.score),
        reasoning,
      }
    } catch (error) {
      return {
        score: 0,
        reasoning: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  async judgeRAG(
    question: string,
    answer: string,
    contexts: string[],
  ): Promise<RAGMetrics> {
    const prompt = `You are a RAG evaluation expert. Evaluate the following RAG system output.

Question: ${question}

Retrieved Contexts:
${contexts.map((ctx, i) => `${i + 1}. ${ctx}`).join('\n')}

Answer: ${answer}

Evaluate these metrics (0-1 scale):
1. Faithfulness: How well does the answer stick to the retrieved contexts without hallucination?
2. Answer Relevance: How relevant and helpful is the answer to the question?
3. Context Precision: How precisely are the relevant contexts ranked/retrieved?
4. Context Recall: How many of the needed contexts were retrieved?

Provide JSON:
{
  "faithfulness": <number>,
  "answerRelevance": <number>,
  "contextPrecision": <number>,
  "contextRecall": <number>
}`

    try {
      const response = await this.getClient().chat([
        { role: 'system', content: 'You are a RAG evaluation expert. Respond only with valid JSON.' },
        { role: 'user', content: prompt },
      ], { jsonMode: true, temperature: this.config.temperature ?? 0, maxTokens: 700 })

      const parsed = this.parseJSON(response.content)
      return {
        faithfulness: clampScore(parsed.faithfulness),
        answerRelevance: clampScore(parsed.answerRelevance),
        contextPrecision: clampScore(parsed.contextPrecision),
        contextRecall: clampScore(parsed.contextRecall),
      }
    } catch (error) {
      return {
        faithfulness: 0,
        answerRelevance: 0,
        contextPrecision: 0,
        contextRecall: 0,
      }
    }
  }

  private parseJSON(content: string): Record<string, unknown> {
    const match = content.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>
      } catch {
        return {}
      }
    }
    return {}
  }
}

export class ToolCallingEvaluator {
  evaluate(toolCalls: ToolCall[], expectedTools: string[]): ToolCallingEvalResult {
    const expectedSet = new Set(expectedTools)
    const calledSet = new Set(toolCalls.map((t) => t.tool))

    const correctCalls = toolCalls.filter((t) =>
      expectedSet.has(t.tool) && t.success !== false,
    )
    const missedTools = expectedTools.filter((t) => !calledSet.has(t))
    const extraTools = toolCalls.map((t) => t.tool).filter((t) => !expectedSet.has(t))

    const precision = toolCalls.length > 0
      ? correctCalls.length / toolCalls.length
      : expectedTools.length === 0 ? 1 : 0
    const recall = expectedTools.length > 0
      ? correctCalls.length / expectedTools.length
      : 1

    const f1 = precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0

    return {
      precision,
      recall,
      f1,
      correctCalls: correctCalls.length,
      missedTools,
      extraTools,
      toolCalls,
    }
  }
}

export function clampScore(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0
}
