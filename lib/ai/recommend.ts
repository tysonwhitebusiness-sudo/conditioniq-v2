import type Anthropic from '@anthropic-ai/sdk'
import type { ReportRecommendation, RecommendationUrgency, ReportRecall } from '@/lib/report/model'
import type { FiredRule } from './rules'

// B4 · Turning fired rules into the report's recommendations.
//
// The model may only group and word the rules that fired: every
// recommendation it returns must list the rule ids it stands for, cover each
// rule exactly once, and carry the most urgent of its rules' urgencies. If an
// answer breaks any of that, it is thrown away and the plain grouping below is
// used instead, so a report never depends on the AI being right.

export const RECOMMEND_PROMPT_VERSION = 'recommend-v1'

const URGENCY_ORDER: RecommendationUrgency[] = ['Before road use', 'Soon', 'Reconditioning']
const mostUrgent = (list: RecommendationUrgency[]) => URGENCY_ORDER.find(u => list.includes(u)) ?? 'Reconditioning'

export function recommendRequest(fired: FiredRule[], vehicle: string): { system: string; messages: Anthropic.MessageParam[] } {
  const rules = fired.map(f => ({ id: `${f.ruleId}#${f.evidence}`, action: f.action, urgency: f.urgency, category: f.category, evidence: f.evidence }))
  return {
    system: [
      'You write the "What to do next" section of a vehicle condition report for a fleet or dealer.',
      'You are given the rules that the recorded inspection set off. Group related rules into clear recommendations.',
      'Rules:',
      '- Use only the rules given. Never add a recommendation, fact or repair that is not in them.',
      '- Every rule id must appear in exactly one recommendation.',
      '- A recommendation\'s urgency is the most urgent of its rules (Before road use, then Soon, then Reconditioning).',
      '- action: an instruction of at most 12 words. why: at most 12 words, from the rules\' evidence.',
      '- Group only rules that one job would fix together (for example the same tire, or interior cleaning).',
      'Reply with JSON only: {"recommendations": [{"action": "...", "why": "...", "urgency": "...", "ruleIds": ["..."]}]}',
    ].join('\n'),
    messages: [{ role: 'user', content: `Vehicle: ${vehicle}\nRules that fired:\n${JSON.stringify(rules, null, 1)}` }],
  }
}

export interface ValidationResult {
  ok: boolean
  problems: string[]
  recommendations: ReportRecommendation[]
}

/** Checks the model's answer against the rules; ok only if every recommendation traces back. */
export function validateRecommendations(text: string, fired: FiredRule[]): ValidationResult {
  const byId = new Map(fired.map(f => [`${f.ruleId}#${f.evidence}`, f]))
  const problems: string[] = []
  let parsed: any
  try { parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '') } catch { return { ok: false, problems: ['not JSON'], recommendations: [] } }
  const list: any[] = Array.isArray(parsed?.recommendations) ? parsed.recommendations : []
  if (!list.length && fired.length) problems.push('no recommendations')

  const used = new Map<string, number>()
  const recommendations: ReportRecommendation[] = []
  for (const rec of list) {
    const ids: string[] = Array.isArray(rec?.ruleIds) ? rec.ruleIds : []
    const rules = ids.map(id => byId.get(id))
    if (!ids.length) problems.push(`"${rec?.action}" cites no rule`)
    if (rules.some(r => !r)) problems.push(`"${rec?.action}" cites a rule that did not fire`)
    for (const id of ids) used.set(id, (used.get(id) ?? 0) + 1)
    const real = rules.filter(Boolean) as FiredRule[]
    const urgency = mostUrgent(real.map(r => r.urgency))
    if (real.length && rec?.urgency !== urgency) problems.push(`"${rec?.action}" is ${rec?.urgency}, its rules say ${urgency}`)
    if (typeof rec?.action !== 'string' || !rec.action.trim() || rec.action.split(/\s+/).length > 16) problems.push('an action is missing or too long')
    recommendations.push({
      urgency,
      action: String(rec?.action ?? '').trim(),
      why: typeof rec?.why === 'string' ? rec.why.trim() : undefined,
      source: Array.from(new Set(real.map(r => r.source.name))).join('; '),
    })
  }
  for (const id of Array.from(byId.keys())) {
    const n = used.get(id) ?? 0
    if (n === 0) problems.push(`rule ${id} left out`)
    if (n > 1) problems.push(`rule ${id} used ${n} times`)
  }
  return { ok: problems.length === 0, problems, recommendations }
}

/**
 * The plain grouping: one recommendation per category and urgency. Used when
 * AI is off, skipped by the ceiling, or its answer fails validation.
 */
export function groupRules(fired: FiredRule[]): ReportRecommendation[] {
  const groups = new Map<string, FiredRule[]>()
  for (const f of fired) {
    const key = `${f.urgency}|${f.category}`
    groups.set(key, [...(groups.get(key) ?? []), f])
  }
  return Array.from(groups.values()).map(rules => ({
    urgency: rules[0].urgency,
    action: rules.length === 1 ? rules[0].action : `${rules[0].category}: ${Array.from(new Set(rules.map(r => r.action.replace(/\.$/, '')))).join('; ')}`,
    why: rules.map(r => r.evidence).join(', '),
    source: Array.from(new Set(rules.map(r => r.source.name))).join('; '),
  })).sort((a, b) => URGENCY_ORDER.indexOf(a.urgency) - URGENCY_ORDER.indexOf(b.urgency))
}

/** Recalls are listed as they are: the model never words or filters them. */
export function recallRecommendations(recalls: ReportRecall[]): ReportRecommendation[] {
  return recalls.map(r => ({
    urgency: 'Before road use' as const,
    action: `Confirm recall ${r.id} was repaired`,
    why: `Open recall for this model: ${r.component}`,
    source: `NHTSA recall ${r.id}`,
  }))
}
