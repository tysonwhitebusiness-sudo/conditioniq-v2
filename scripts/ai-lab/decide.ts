// B5 · Picks the launch setup from the runs already made.
//
//   npx tsx scripts/ai-lab/decide.ts [tuning|test]
//
// Every saved run is rescored at several confidence thresholds, with and
// without agreement across photos, all from cached answers, so this costs
// nothing. The rule, fixed before looking at results:
//
//   among setups with false alarms on clean photos at or below MAX_FALSE_ALARM
//   and a live cost per inspection at or below MAX_COST, take the one that
//   finds the most damaged photos; ties go to fewer false alarms, then cost.
//
// MAX_COST leaves room in the $0.20 per-inspection ceiling for the other
// features (scan, photo check, gauges) and the $0.05 summary reserve.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { RUNS_DIR } from './config'
import { score, withAgreement, printTable, type ItemResult, type Metrics } from './harness'

const MAX_FALSE_ALARM = 0.15
const MAX_COST = 0.08
const THRESHOLDS = [0.5, 0.6, 0.7, 0.8]

const set = process.argv[2] ?? 'tuning'
const runs = readdirSync(RUNS_DIR)
  .filter(f => f.endsWith(`--${set}.json`) && !f.includes('+agree'))
  .map(f => JSON.parse(readFileSync(join(RUNS_DIR, f), 'utf8')) as { metrics: Metrics; results: ItemResult[] })

const rows: Metrics[] = []
for (const run of runs) {
  const base = run.metrics.technique
  for (const threshold of THRESHOLDS) {
    rows.push(score(run.results, `${base}@${threshold}`, set, threshold))
    rows.push(score(withAgreement(run.results, 0.85, threshold), `${base}+agree@${threshold}`, set, threshold))
  }
}
rows.sort((a, b) => b.photoRecall - a.photoRecall || a.falseAlarmRate - b.falseAlarmRate)
printTable(rows)

const eligible = rows.filter(r => r.falseAlarmRate <= MAX_FALSE_ALARM && r.costPerInspectionUsd <= MAX_COST && !r.failed)
const winner = eligible.sort((a, b) => b.photoRecall - a.photoRecall || a.falseAlarmRate - b.falseAlarmRate || a.costPerInspectionUsd - b.costPerInspectionUsd)[0]
console.log(winner
  ? `\nWinner on ${set}: ${winner.technique} — finds ${Math.round(winner.photoRecall * 100)}% of damaged photos, ${Math.round(winner.falseAlarmRate * 100)}% false alarms, $${winner.costPerInspectionUsd.toFixed(3)} per inspection live`
  : `\nNo setup meets the bar (false alarms ≤ ${MAX_FALSE_ALARM * 100}%, cost ≤ $${MAX_COST}).`)
writeFileSync(join(RUNS_DIR, `decision--${set}.json`), JSON.stringify({ rule: { MAX_FALSE_ALARM, MAX_COST, THRESHOLDS }, winner, rows }, null, 1))
