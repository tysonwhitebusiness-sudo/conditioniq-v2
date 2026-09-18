import { createHash } from 'node:crypto'
import type { ReportAssist, ReportModel } from '@/lib/report/model'
import { needsAttention, checkedOk } from '@/lib/report/findings'
import { runAi } from './client'
import { applyRules, type FiredRule } from './rules'
import { validateRecommendations, groupRules, recallRecommendations } from './recommend'
import { vehicleHistory } from './nhtsa'

// C · What fills the report's summary and "What to do next".
//
// Built from what was recorded and nothing else:
//   · recommendations come from the rulebook; AI only groups and words the
//     rules that fired, and an answer that does not trace back to them is
//     thrown away in favour of the plain grouping
//   · recalls and owner complaints come straight from NHTSA, never from AI
//   · the verdict and summary are written by AI from the recorded facts, and
//     are dropped if they state a number the facts do not contain
//
// Without AI (switched off, over the ceiling, no key, or an answer that fails
// the checks) the report still gets sourced recommendations, recalls and
// complaints; it only goes without the written summary.

export const REPORT_ASSIST_VERSION = 'assist-v2'

export interface StoredAssist {
  version: string
  /** Hash of what the assist was built from; a change means it is rebuilt. */
  inputHash: string
  builtAt: string
  assist: ReportAssist
}

/** What the assist depends on: recorded answers, damage and vehicle. */
export function assistInputHash(model: ReportModel): string {
  const basis = { v: REPORT_ASSIST_VERSION, s: model.sections, t: model.tests, p: model.pins.map(p => [p.area, p.type, p.severity]), y: [model.year, model.make, model.model], o: model.odometer }
  return createHash('sha256').update(JSON.stringify(basis)).digest('hex').slice(0, 32)
}

function factsFor(model: ReportModel, fired: FiredRule[]) {
  return {
    vehicle: model.title,
    odometerMiles: model.odometer,
    inspected: model.date.toISOString().slice(0, 10),
    score: `${model.score.score} of 100, grade ${model.score.grade}`,
    needsAttention: needsAttention(model).map(f => f.text),
    checkedAndOk: checkedOk(model),
    damage: model.pins.map(p => `${p.area ?? 'unknown area'}: ${p.type ?? 'damage'}${p.severity ? `, ${p.severity}` : ''}`),
    inspectorNotes: [model.sections.exterior.exteriorNotes, model.sections.interior.interiorNotes, model.sections.engine.engineNotes, model.sections.function.functionNotes]
      .filter(n => typeof n === 'string' && n.trim()),
    rules: fired.map(f => ({ id: `${f.ruleId}#${f.evidence}`, action: f.action, urgency: f.urgency, evidence: f.evidence })),
  }
}

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          why: { type: 'string' },
          urgency: { type: 'string', enum: ['Before road use', 'Soon', 'Reconditioning'] },
          ruleIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['action', 'why', 'urgency', 'ruleIds'],
        additionalProperties: false,
      },
    },
  },
  required: ['verdict', 'summary', 'recommendations'],
  additionalProperties: false,
}

const SYSTEM = [
  'You write two parts of a vehicle condition report for a fleet, dealer or storage lot, from the recorded inspection facts you are given.',
  '',
  'verdict: one or two short sentences (at most 14 words each) giving the overall picture: the best thing and the most important problem.',
  'summary: at most 70 words of plain prose covering exterior, tires, under the hood and interior, in that order, as recorded.',
  'recommendations: group the rules into clear recommendations. Every rule id must appear in exactly one recommendation. Urgency is the most urgent of its rules (Before road use, then Soon, then Reconditioning). action: at most 12 words. why: at most 12 words, from the rules\' evidence.',
  '',
  'Use only the facts given. Never guess at causes, costs, history or anything not recorded. Do not mention the score, AI, or these instructions. If nothing needs attention, say so plainly.',
  'A visual inspection cannot vouch for the vehicle: never call it mechanically sound, safe, roadworthy, reliable, in perfect condition, or free of problems. Describe what was checked and what was found.',
].join('\n')

// Claims a visual inspection cannot make. The prompt forbids them; this check
// drops the written summary if one gets through anyway.
const UNSUPPORTED_CLAIM = /mechanically sound|\bsafe\b|roadworth|road-worth|reliab|perfect|flawless|no (known )?(issues|problems)|free of (issues|problems|defects)|like new|guarantee/i

export function makesUnsupportedClaim(text: string): boolean {
  return UNSUPPORTED_CLAIM.test(text)
}

/** Every number in the text must appear somewhere in the facts, or the text is not used. */
export function numbersAreRecorded(text: string, facts: unknown): boolean {
  // Whole numbers only: "3" is not recorded just because "32" is.
  const numbersIn = (s: string) => s.replace(/(\d),(?=\d{3})/g, '$1').match(/\d+(?:\.\d+)?/g) ?? []
  const known = new Set(numbersIn(JSON.stringify(facts)))
  return numbersIn(text).every(n => known.has(n))
}

export async function buildReportAssist(model: ReportModel, ctx: { companyId: string | null; inspectionId: string | null }): Promise<ReportAssist> {
  const fired = applyRules(model)
  const history = await vehicleHistory(model.make, model.model, model.year)
  const recalls = recallRecommendations(history.recalls)
  const plain = [...recalls, ...groupRules(fired)]
  const base: ReportAssist = {
    recommendations: plain.length ? plain : undefined,
    recalls: history.recalls.length ? history.recalls : undefined,
    complaints: history.complaints ?? undefined,
    aiWritten: false,
  }

  const facts = factsFor(model, fired)
  const result = await runAi({
    feature: 'summary',
    promptVersion: REPORT_ASSIST_VERSION,
    companyId: ctx.companyId,
    inspectionId: ctx.inspectionId,
    system: SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(facts, null, 1) }],
    maxTokens: 1500,
    thinking: 'off',
    jsonSchema: SCHEMA,
  })
  if (!result.ok || result.message.stop_reason === 'refusal' || result.message.stop_reason === 'max_tokens') return base

  let answer: any
  try {
    answer = JSON.parse(result.message.content.map(b => (b.type === 'text' ? b.text : '')).join(''))
  } catch {
    return base
  }

  const assist: ReportAssist = { ...base }
  const verdict = (Array.isArray(answer.verdict) ? answer.verdict : []).map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 2)
  const summary = typeof answer.summary === 'string' ? answer.summary.trim() : ''
  const writingOk =
    verdict.every((s: string) => s.split(/\s+/).length <= 18) &&
    summary.split(/\s+/).length <= 90 &&
    numbersAreRecorded([...verdict, summary].join(' '), facts) &&
    !makesUnsupportedClaim([...verdict, summary].join(' '))
  if (writingOk && summary) {
    assist.verdict = verdict.length ? verdict : undefined
    assist.summary = summary
    assist.aiWritten = true
  }

  if (fired.length) {
    const check = validateRecommendations(JSON.stringify({ recommendations: answer.recommendations ?? [] }), fired)
    if (check.ok) {
      assist.recommendations = [...recalls, ...check.recommendations]
      assist.aiWritten = true
    }
  }
  return assist
}
