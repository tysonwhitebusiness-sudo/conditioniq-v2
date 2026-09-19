// D · Measures the AI photo check (right subject, framed) on the quality set.
//
//   npx tsx scripts/ai-lab/photo-check-lab.ts
//
//   good     real customer photos with their true slot: should pass
//   framing  the same photos cropped to a corner: should be "not framed"
//   wrong    real photos checked against the wrong slot (front as rear, driver
//            side as passenger side, ...): should be "wrong subject"

import type Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { SETS_DIR, loadEnv } from './config'
loadEnv()

const SWAP: Record<string, string> = {
  exteriorFrontPhoto: 'exteriorRearPhoto', exteriorRearPhoto: 'exteriorFrontPhoto',
  // Side views are checked as front or rear: which side is not asked (v2).
  exteriorDriverPhoto: 'exteriorFrontPhoto', exteriorPassengerPhoto: 'exteriorRearPhoto',
}

async function main() {
  const { readManifest, batchTexts } = await import('./harness')
  const { photoCheckRequest, parsePhotoCheck, PHOTO_CHECK_MODEL, PHOTO_CHECK_EDGE, PHOTO_CHECK_SCHEMA } = await import('../../lib/ai/photo-check')
  const cases: Array<{ key: string; kind: 'good' | 'framing' | 'wrong'; params: Anthropic.MessageCreateParamsNonStreaming }> = []
  for (const item of readManifest().quality) {
    if (item.problem !== 'none' && item.problem !== 'framing') continue
    const slot = item.file.match(/-(exterior[A-Za-z]+Photo)-/)?.[1]
    if (!slot) continue
    const image = (await sharp(readFileSync(join(SETS_DIR, item.file))).resize({ width: PHOTO_CHECK_EDGE, height: PHOTO_CHECK_EDGE, fit: 'inside' }).jpeg({ quality: 80 }).toBuffer()).toString('base64')
    const make = (s: string) => ({ model: PHOTO_CHECK_MODEL, max_tokens: 150, thinking: { type: 'disabled' }, output_config: { format: { type: 'json_schema', schema: PHOTO_CHECK_SCHEMA } }, ...photoCheckRequest(s, image)! } as any)
    if (item.problem === 'none') {
      cases.push({ key: `${item.id}:good`, kind: 'good', params: make(slot) })
      cases.push({ key: `${item.id}:wrong`, kind: 'wrong', params: make(SWAP[slot]) })
    } else cases.push({ key: `${item.id}:framing`, kind: 'framing', params: make(slot) })
  }
  const answers = await batchTexts('photo check', cases)
  const tally = { good: [0, 0], framing: [0, 0], wrong: [0, 0] } as Record<string, [number, number]>
  const bySwap: Record<string, [number, number]> = {}
  let cost = 0
  const misses: string[] = []
  for (const c of cases) {
    const a = answers.get(c.key); if (!a) continue
    cost += a.costUsd
    const check = parsePhotoCheck(a.text)
    const ok = c.kind === 'good' ? !!check && check.rightSubject && check.framed
      : c.kind === 'framing' ? !!check && !check.framed
      : !!check && !check.rightSubject
    if (c.kind === 'wrong') { const from = c.key.match(/-(exterior[A-Za-z]+Photo)-/)![1]; const k = `${from} checked as ${SWAP[from]}`; bySwap[k] ??= [0, 0]; bySwap[k][1]++; if (ok) bySwap[k][0]++ }
    tally[c.kind][1]++
    if (ok) tally[c.kind][0]++; else if (misses.length < 12) misses.push(`${c.kind} ${c.key}: ${a.text}`)
  }
  console.log(`\ngood photos passed:        ${tally.good[0]}/${tally.good[1]}`)
  console.log(`cropped caught (framing):  ${tally.framing[0]}/${tally.framing[1]}`)
  console.log(`wrong slot caught:         ${tally.wrong[0]}/${tally.wrong[1]}`)
  for (const [k, [a, b]] of Object.entries(bySwap)) console.log(`   ${k}: caught ${a}/${b}`)
  console.log(`cost per photo (live): $${(cost * 2 / cases.length).toFixed(4)}`)
  console.log('\nmisses:\n' + misses.join('\n'))
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
