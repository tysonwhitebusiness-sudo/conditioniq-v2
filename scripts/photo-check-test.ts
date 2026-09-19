// D · Checks the on-phone quality maths and the report's photo check line.
//
//   npx tsx scripts/photo-check-test.ts

import { measureQuality, qualityProblems } from '../lib/photo-quality'
import { photoCheckLine } from '../lib/report/photo-check-line'
import { parsePhotoCheck, photoCheckRequest } from '../lib/ai/photo-check'

const failures: string[] = []
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failures.push(name) }

// Synthetic images: a sharp checkerboard, the same flattened, and a dark one.
const W = 64, H = 64
const board = new Uint8Array(W * H).map((_, i) => ((Math.floor(i / W) >> 2) + ((i % W) >> 2)) % 2 ? 200 : 60)
const flat = new Uint8Array(W * H).fill(130)
const dark = new Uint8Array(W * H).map((_, i) => ((Math.floor(i / W) >> 2) + ((i % W) >> 2)) % 2 ? 30 : 10)
check('a sharp, lit image has no problems', qualityProblems(measureQuality(board, W, H)).length === 0)
check('a featureless image is blurry', qualityProblems(measureQuality(flat, W, H)).includes('blurry'))
check('a dark image is dark', qualityProblems(measureQuality(dark, W, H)).includes('dark'))
check('a dark image is not also called blurry', !qualityProblems(measureQuality(dark, W, H)).includes('blurry'))
check('a washed-out image is bright', qualityProblems(measureQuality(new Uint8Array(W * H).fill(250), W, H)).includes('bright'))

// Report line
check('no concerns means no line', photoCheckLine([{ slot: 'exteriorFrontPhoto', problems: [], right_subject: true, framed: true, note: null }]).text === null)
const line = photoCheckLine([
  { slot: 'exteriorFrontPhoto', problems: ['blurry'], right_subject: true, framed: true, note: null },
  { slot: 'exteriorRearPhoto', problems: [], right_subject: false, framed: true, note: 'Shows the front' },
  { slot: 'dashboardPhoto', problems: [], right_subject: null, framed: null, note: null },
])
check('lists each kept concern with its caption', line.text === '2 photos were kept with a concern: "Front" blurry; "Rear" may show a different view.')
check('marks when the AI contributed', line.usedAi === true)
check('phone-only concerns are not AI', photoCheckLine([{ slot: 'dashboardPhoto', problems: ['dark'], right_subject: null, framed: null, note: null }]).usedAi === false)

// AI check plumbing
check('an unknown slot gets no AI check', photoCheckRequest('someOtherPhoto', 'x') === null)
check('a known slot gets a request', photoCheckRequest('exteriorFrontPhoto', 'x') !== null)
check('parses a structured answer', parsePhotoCheck('{"rightSubject":false,"framed":true,"note":"Shows the rear"}')?.rightSubject === false)
check('rejects a malformed answer', parsePhotoCheck('{"rightSubject":"no"}') === null)

if (failures.length) { console.error(`\n${failures.length} failed`); process.exit(1) }
console.log('\nAll photo check checks passed.')
