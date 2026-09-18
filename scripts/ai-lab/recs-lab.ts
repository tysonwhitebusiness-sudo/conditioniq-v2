// B4 · Runs the recommendation rulebook over real customer inspections, has
// the model group the fired rules (one batch), and checks that every
// recommendation it writes traces back to a rule.
//
//   npx tsx scripts/ai-lab/recs-lab.ts

import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnv, RUNS_DIR } from './config'
loadEnv()

async function main() {
  const { createAdminClient } = await import('../../lib/supabase/admin')
  const { buildReportModel } = await import('../../lib/report/model')
  const { calculateVehicleScore } = await import('../../lib/vehicle-score')
  const { applyRules } = await import('../../lib/ai/rules')
  const { recommendRequest, validateRecommendations, groupRules } = await import('../../lib/ai/recommend')
  const { readManifest } = await import('./harness')
  const { AI_MODEL, costOf } = await import('../../lib/ai/pricing')

  const db = createAdminClient()
  const ids = readManifest().recommendations
  const { data: rows } = await db.from('vehicle_inspections').select('*').in('id', ids)
  const cases = (rows ?? []).map(row => {
    const model = buildReportModel(row, calculateVehicleScore(row), [])
    return { id: row.id as string, model, fired: applyRules(model) }
  })
  const withRules = cases.filter(c => c.fired.length)
  const ruleCounts = new Map<string, number>()
  for (const c of cases) for (const f of c.fired) ruleCounts.set(f.ruleId, (ruleCounts.get(f.ruleId) ?? 0) + 1)
  console.log(`${cases.length} inspections, ${withRules.length} with rules fired, ${cases.reduce((s, c) => s + c.fired.length, 0)} rules in all`)
  console.log('most common:', Array.from(ruleCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} ${n}`).join(', '))

  const client = new Anthropic()
  const batch = await client.messages.batches.create({
    requests: withRules.map(c => ({
      custom_id: c.id,
      params: { model: AI_MODEL, max_tokens: 1200, thinking: { type: 'disabled' }, ...recommendRequest(c.fired, c.model.name) } as Anthropic.MessageCreateParamsNonStreaming,
    })),
  })
  process.stdout.write(`batch ${batch.id} `)
  let status = batch
  while (status.processing_status !== 'ended') {
    await new Promise(r => setTimeout(r, 20_000))
    status = await client.messages.batches.retrieve(batch.id)
    process.stdout.write('.')
  }
  console.log(' done')

  let cost = 0, valid = 0, recs = 0, plainRecs = 0
  const problems = new Map<string, number>()
  const samples: unknown[] = []
  for await (const result of await client.messages.batches.results(batch.id)) {
    const c = withRules.find(x => x.id === result.custom_id)!
    if (result.result.type !== 'succeeded') { problems.set('request failed', (problems.get('request failed') ?? 0) + 1); continue }
    const m = result.result.message
    cost += costOf(AI_MODEL, { inputTokens: m.usage.input_tokens, outputTokens: m.usage.output_tokens }) * 0.5
    const text = m.content.map(b => (b.type === 'text' ? b.text : '')).join('')
    const check = validateRecommendations(text, c.fired)
    if (check.ok) valid++
    for (const p of check.problems) {
      const kind = p.replace(/"[^"]*"/g, '"…"').replace(/rule \S+/g, 'rule …')
      problems.set(kind, (problems.get(kind) ?? 0) + 1)
    }
    recs += check.recommendations.length
    plainRecs += groupRules(c.fired).length
    if (samples.length < 6) samples.push({ vehicle: c.model.name, fired: c.fired.map(f => `${f.urgency} · ${f.action} · ${f.evidence}`), ai: check.recommendations, problems: check.problems })
  }
  mkdirSync(RUNS_DIR, { recursive: true })
  writeFileSync(join(RUNS_DIR, 'recs-lab.json'), JSON.stringify({ samples, problems: Object.fromEntries(problems) }, null, 1))
  console.log(`\ntraceable: ${valid}/${withRules.length} answers passed every check`)
  console.log(`recommendations: ${recs} from the model, ${plainRecs} from the plain grouping`)
  console.log('problems:', JSON.stringify(Object.fromEntries(problems)))
  console.log(`cost $${cost.toFixed(4)} (batch); $${(cost * 2 / withRules.length).toFixed(4)} per inspection live`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
