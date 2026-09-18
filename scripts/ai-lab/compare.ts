// B · Scores every saved run on a set the same way, side by side.
//
//   npx tsx scripts/ai-lab/compare.ts [test|tuning] [cutoff]
//
// All from cached answers: nothing is sent. Uses agreement across photos.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RUNS_DIR } from './config'
import { score, withAgreement, printTable, type ItemResult, type Metrics } from './harness'

const set = process.argv[2] ?? 'test'
const cutoff = Number(process.argv[3] ?? 0.3)
const rows: Metrics[] = []
const byGroup: string[] = []
for (const file of readdirSync(RUNS_DIR).filter(f => f.endsWith(`--${set}.json`) && !f.includes('+agree') && !f.startsWith('decision'))) {
  const { metrics, results } = JSON.parse(readFileSync(join(RUNS_DIR, file), 'utf8')) as { metrics: Metrics; results: ItemResult[] }
  const scored = withAgreement(results, 0.85, cutoff)
  rows.push(score(scored, metrics.technique, set, cutoff))
  const per: Record<string, [number, number]> = {}
  for (const r of scored) {
    const got = new Set(r.found.filter(f => f.confidence >= cutoff).map(f => f.group))
    for (const g of r.truth) { per[g] ??= [0, 0]; per[g][1]++; if (got.has(g)) per[g][0]++ }
  }
  byGroup.push(`${metrics.technique.padEnd(22)} ${Object.entries(per).sort().map(([g, [a, b]]) => `${g} ${a}/${b}`).join('  ')}`)
}
rows.sort((a, b) => b.photoRecall - a.photoRecall || a.falseAlarmRate - b.falseAlarmRate)
console.log(`${set} set, cutoff ${cutoff}, agreement across photos`)
printTable(rows)
console.log('\nright group, by damage type:')
for (const line of byGroup.sort()) console.log(line)
