// A · What a call costs, and the most it could cost.
//
// Prices are per million tokens. Batch requests are billed at half of these.
// Check them against Anthropic's pricing page
// when a model changes: the ceiling is only as honest as these numbers.

export const AI_MODEL = 'claude-sonnet-5'

export const MODEL_PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  // $2 in / $10 out per million; cache reads at a tenth of input.
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
}

export interface AiUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
}

/** Dollars for a finished call, from the usage the API reported. */
export function costOf(model: string, usage: AiUsage): number {
  const price = MODEL_PRICES[model]
  if (!price) throw new Error(`No price recorded for ${model}`)
  return (usage.inputTokens * price.input + usage.outputTokens * price.output + (usage.cacheReadTokens ?? 0) * price.cacheRead) / 1_000_000
}

/**
 * The most a call can cost before it is sent: every input token at the full
 * input price and every allowed output token used. A call is only made when
 * this worst case still fits inside what is left of the inspection's ceiling.
 */
export function worstCaseCost(model: string, inputTokens: number, maxOutputTokens: number): number {
  return costOf(model, { inputTokens, outputTokens: maxOutputTokens })
}

export interface BudgetState {
  ceiling: number
  /** Held back for the report summary, which runs last. */
  summaryReserve: number
  /** Already spent on this inspection. */
  spent: number
}

/**
 * Whether a call fits. Every feature except the summary must leave the summary
 * reserve untouched, so the summary is never the call that gets skipped.
 * A call that does not fit is skipped; nothing is ever cut off mid-inspection.
 */
export function fitsBudget(budget: BudgetState, worstCase: number, isSummary: boolean): boolean {
  const limit = isSummary ? budget.ceiling : budget.ceiling - budget.summaryReserve
  return budget.spent + worstCase <= limit + 1e-9
}
