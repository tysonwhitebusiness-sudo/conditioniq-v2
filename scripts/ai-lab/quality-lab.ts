// D · Measures the free on-phone photo checks on the lab's quality set.
//
//   npx tsx scripts/ai-lab/quality-lab.ts
//
// Every photo is shrunk to the same small grayscale copy the phone uses, then
// measured. Prints how well each problem is caught, the false alarm rate on
// good photos, and a sweep of thresholds to choose from.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { SETS_DIR } from './config'
import { readManifest } from './harness'
import { measureQuality, qualityProblems, QUALITY_EDGE, QUALITY_THRESHOLDS, type QualityMeasure } from '../../lib/photo-quality'

async function main() {
  const items = readManifest().quality
  const measured: Array<{ problem: string; m: QualityMeasure }> = []
  for (const item of items) {
    const { data, info } = await sharp(readFileSync(join(SETS_DIR, item.file)))
      .resize({ width: QUALITY_EDGE, height: QUALITY_EDGE, fit: 'inside' }).grayscale().raw().toBuffer({ resolveWithObject: true })
    measured.push({ problem: item.problem, m: measureQuality(data, info.width, info.height) })
  }

  const byProblem = (p: string) => measured.filter(x => x.problem === p)
  const range = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return `${Math.round(s[0])}–${Math.round(s[s.length - 1])} (median ${Math.round(s[s.length >> 1])})` }
  for (const p of ['none', 'blurry', 'dark', 'framing']) {
    const xs = byProblem(p)
    console.log(`${p.padEnd(8)} n=${xs.length}  sharpness ${range(xs.map(x => x.m.sharpness))}  brightness ${range(xs.map(x => x.m.brightness))}`)
  }

  const report = (label: string, t = QUALITY_THRESHOLDS) => {
    const caught = (p: string, want: string) => byProblem(p).filter(x => qualityProblems(x.m, t).includes(want as any)).length
    const good = byProblem('none'), framing = byProblem('framing')
    const falseOnGood = good.filter(x => qualityProblems(x.m, t).length).length
    const falseOnFraming = framing.filter(x => qualityProblems(x.m, t).length).length
    console.log(`${label.padEnd(34)} blurry caught ${caught('blurry', 'blurry')}/${byProblem('blurry').length}  dark caught ${caught('dark', 'dark')}/${byProblem('dark').length}  false alarms on good ${falseOnGood}/${good.length}  flags on framing ${falseOnFraming}/${framing.length}`)
  }
  console.log('')
  report(`current ${JSON.stringify(QUALITY_THRESHOLDS)}`)
  for (const minSharpness of [20, 40, 60, 100, 150]) for (const minBrightness of [35, 45, 60]) {
    report(`sharp<${minSharpness} bright<${minBrightness}`, { ...QUALITY_THRESHOLDS, minSharpness, minBrightness })
  }
}

main().catch(e => { console.error(e); process.exit(1) })
