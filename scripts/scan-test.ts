// S · Checks plate and VIN reading.
//
//   npm run scan:test
//
// Plates: the text PaddleOCR read from 47 real inspection photos (16 with a
// readable plate, 31 without) is replayed through pickPlate, so the picking
// rules are tested without running the reader. The expected plates were read
// by eye from the photos, not taken from what was typed.
// VINs: known-good VINs, misreads that must be repaired, and ones that must fail.

import { readFileSync } from 'node:fs'
import { pickPlate, fitStateFormat } from '../lib/scan/plate'
import { extractVin, repairVin } from '../lib/scan/vin'

const failures: string[] = []
const check = (name: string, ok: boolean, detail = '') => { if (!ok) { failures.push(name); console.log(`FAIL ${name} ${detail}`) } }

// ── Plates ─────────────────────────────────────────────────────────────────
const cases: Array<{ name: string; expected: string | null; state: string | null; lines: Array<{ text: string; confidence: number; height: number }> }> =
  JSON.parse(readFileSync('scripts/fixtures/plate-ocr-lines.json', 'utf8'))

let right = 0, wrong = 0, missed = 0, falseReads = 0, negatives = 0
for (const c of cases) {
  const read = pickPlate(c.lines, c.state)
  if (c.expected) {
    if (!read) { missed++; check(`${c.name} read`, false, `expected ${c.expected}, read nothing`) }
    else if (read.plate === c.expected) right++
    else { wrong++; check(`${c.name} read`, false, `expected ${c.expected}, read ${read.plate}`) }
  } else {
    negatives++
    if (read) falseReads++
  }
}
console.log(`plates: ${right}/${right + wrong + missed} right, ${wrong} wrong, ${missed} missed; ${falseReads}/${negatives} photos without a plate returned a read`)
// Every read is shown to the inspector to confirm, so a few reads from photos
// of screens are tolerable; a jump would mean the rules got looser.
check('false reads stay rare', falseReads <= 3, `${falseReads}`)

check('Oklahoma O/0 fixed by format', fitStateFormat('Q0E750', 'OK') === 'QOE750')
check('Indiana digits kept', fitStateFormat('164DQK', 'IN') === '164DQK')
check('no format for an unknown state', fitStateFormat('ABC123', 'ZZ') === null)
check('a date is never a plate', pickPlate([{ text: '08-20-2026', confidence: 0.99, height: 90 }], 'IN') === null)
check('low confidence is not a read', pickPlate([{ text: 'ABC123', confidence: 0.5, height: 90 }], null) === null)

// ── VINs ───────────────────────────────────────────────────────────────────
check('a clean VIN', extractVin('1N4BL4BVXRN354582') === '1N4BL4BVXRN354582')
check('a VIN inside a label payload', extractVin('P/N 12345 VIN:5N1BT3AB4SC793155 MFD 03/25') === '5N1BT3AB4SC793155')
check('O read for 0 is repaired', extractVin('1HGCM82633AOO4352') === '1HGCM82633A004352')
check('I and O repaired', repairVin('1N4BL4BVXRN354582'.replace('1', 'I')) === '1N4BL4BVXRN354582')
check('a wrong check digit fails', extractVin('1N4BL4BV5RN354582') === null)
check('too short fails', extractVin('1N4BL4BVXRN3545') === null)
check('spaces inside are tolerated', extractVin('1N4BL4BVX RN354582') === '1N4BL4BVXRN354582')

if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1) }
console.log('\nAll scan checks passed.')
