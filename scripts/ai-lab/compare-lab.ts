// G · Measures the check-in vs check-out comparison.
//
//   npx tsx scripts/ai-lab/compare-lab.ts [--model claude-sonnet-5] [--edge 768]
//
// False alarms are the costly error here (an inspector told damage is new when
// it was there all along), and they are what this set measures well:
//   real      same vehicle, inspected twice by customers, nothing new (checked by eye)
//   existing  labelled damage present in both photos
//   other     two different vehicles: should be "not comparable"
//   added     a real damage crop pasted onto a real pair's check-out photo (loose recall
//             indicator only: several crops land off the vehicle)
// Recall has no honest test set until real check-outs with confirmed new
// damage exist.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { SETS_DIR, loadEnv } from './config'
loadEnv()

const arg = (name: string, fallback: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback }
const MODEL = arg('model', 'claude-opus-5')
const EDGE = Number(arg('edge', '1024'))
const PROMPT = arg('prompt', 'v2')
const THRESHOLDS = [0.5, 0.7, 0.85]
// Customer pairs where one inspection's photos are not the vehicle (plate
// photos, black frames): the right answer is "not comparable" or nothing.
const JUNK = /real-(410541|074248)-/

async function main() {
  const { batchTexts } = await import('./harness')
  const { compareRequest, parseCompare, COMPARE_SCHEMA, COMPARE_SCHEMA_V1, COMPARE_SYSTEM, COMPARE_SYSTEM_V1, COMPARE_MAX_TOKENS } = await import('../../lib/ai/checkin-compare')
  const [system, schema, maxTokens] = PROMPT === 'v1' ? [COMPARE_SYSTEM_V1, COMPARE_SCHEMA_V1, 300] : [COMPARE_SYSTEM, COMPARE_SCHEMA, COMPARE_MAX_TOKENS]
  const items = (JSON.parse(readFileSync(join(SETS_DIR, 'compare.json'), 'utf8')).items as any[])

  const load = async (f: string) => (await sharp(readFileSync(join(SETS_DIR, f))).resize(EDGE, EDGE, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer()).toString('base64')
  const entries = []
  for (const it of items) {
    entries.push({ key: it.id, params: {
      model: MODEL, max_tokens: maxTokens, thinking: { type: 'disabled' },
      output_config: { format: { type: 'json_schema', schema } },
      ...compareRequest(await load(it.before), await load(it.after), system),
    } as any })
  }
  const answers = await batchTexts(`compare ${PROMPT} ${MODEL} @${EDGE}`, entries)

  let cost = 0
  const rows: Record<string, { n: number; notComparable: number; alarms: number[]; unread: number }> = {}
  const notes: string[] = []
  for (const it of items) {
    const a = answers.get(it.id); if (!a) continue
    cost += a.costUsd
    const kind = it.kind === 'real' && JUNK.test(it.id) ? 'real (junk photos)' : it.kind
    const r = (rows[kind] ??= { n: 0, notComparable: 0, alarms: THRESHOLDS.map(() => 0), unread: 0 })
    r.n++
    const c = parseCompare(a.text)
    if (!c) { r.unread++; continue }
    if (!c.comparable) r.notComparable++
    const top = Math.max(0, ...c.newDamage.map(d => d.confidence))
    THRESHOLDS.forEach((t, i) => { if (top >= t) r.alarms[i]++ })
    if (c.newDamage.length) notes.push(`${it.id}: ${c.newDamage.map(d => `${d.group} ${d.confidence} "${d.where}"`).join('; ')}`)
  }
  console.log(`\n${MODEL} at ${EDGE}px, ${items.length} pairs, $${(cost / items.length).toFixed(4)} a pair (batch), ~$${(cost / items.length * 2 * 4).toFixed(3)} a check-out live (4 sides)`)
  console.log(`kind                 pairs  not comparable   reported new at ${THRESHOLDS.join(' / ')}`)
  for (const [k, r] of Object.entries(rows)) {
    console.log(`${k.padEnd(20)} ${String(r.n).padStart(5)}  ${String(r.notComparable).padStart(14)}   ${r.alarms.join(' / ')}${r.unread ? `  (${r.unread} unreadable)` : ''}`)
  }
  console.log('\nEverything reported as new:\n' + notes.join('\n'))
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
