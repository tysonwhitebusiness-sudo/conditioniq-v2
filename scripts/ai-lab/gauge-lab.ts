// E · Reads the odometer and fuel gauge from the gauge set's real photos with
// Sonnet and Opus, and compares each reading with what the inspector typed.
//
//   npx tsx scripts/ai-lab/gauge-lab.ts
//
// The typed value is not always right and many photos do not show the
// odometer, so the output is a table to be checked by eye, not a score.

import type Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SETS_DIR, loadEnv } from './config'
loadEnv()

async function main() {
  const { batchTexts } = await import('./harness')
  const { photoCheckRequest, photoCheckSchema, parsePhotoCheck } = await import('../../lib/ai/photo-check')
  const { parseGauges, compareOdometer, fuelText } = await import('../../lib/ai/gauges')
  const items: Array<{ id: string; file: string; slot: string; typed: number }> = JSON.parse(readFileSync(join(SETS_DIR, 'gauges.json'), 'utf8'))
  const models = ['claude-sonnet-5', 'claude-opus-5']
  const entries = items.flatMap(it => models.map(model => {
    const image = readFileSync(join(SETS_DIR, it.file)).toString('base64')
    return { key: `${model}:${it.id}`, params: { model, max_tokens: 200, thinking: { type: 'disabled' }, output_config: { format: { type: 'json_schema', schema: photoCheckSchema(it.slot) } }, ...photoCheckRequest(it.slot, image)! } as Anthropic.MessageCreateParamsNonStreaming }
  }))
  const answers = await batchTexts('gauges', entries)
  const counts: Record<string, Record<string, number>> = {}
  console.log('\nphoto                          typed    sonnet (status, fuel)            opus (status, fuel)')
  for (const it of items) {
    const cells = models.map(model => {
      const a = answers.get(`${model}:${it.id}`)
      if (!a) return 'no answer'
      let raw: any = null; try { raw = JSON.parse(a.text) } catch {}
      const g = parseGauges(raw)
      const status = compareOdometer(g, it.typed)
      counts[model] ??= {}; counts[model][status] = (counts[model][status] ?? 0) + 1
      const subject = parsePhotoCheck(a.text)?.rightSubject === false ? ' [not cluster]' : ''
      return `${String(g.odometer ?? '—').padStart(7)} ${status.padEnd(10)} ${String(fuelText(g.fuel) ?? '—').padEnd(5)}${subject}`
    })
    console.log(`${it.id.padEnd(30)} ${String(it.typed).padStart(6)}  ${cells[0].padEnd(32)} ${cells[1]}`)
  }
  for (const m of models) console.log(`${m}: ${JSON.stringify(counts[m])}`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
