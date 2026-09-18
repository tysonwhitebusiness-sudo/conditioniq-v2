// B4 · Checks the rulebook and the recommendation validator without the model.
//
//   npx tsx scripts/ai-lab/rules-test.ts

import { buildReportModel } from '../../lib/report/model'
import { calculateVehicleScore } from '../../lib/vehicle-score'
import { applyRules } from '../../lib/ai/rules'
import { validateRecommendations, groupRules } from '../../lib/ai/recommend'

const failures: string[] = []
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failures.push(name) }

const inspection = {
  id: '00000000-0000-4000-8000-000000000009', created_at: '2026-09-01T15:00:00Z', vin: '1N4BL4BVXRN354582', year: 2024, make: 'NISSAN', model: 'Altima',
  exterior_data: { glassCondition: 'cracked', glassDamagedPane: 'Windshield', tireFrontLeft: { treadDepth: '2' }, tireFrontRight: { treadDepth: '4', unevenWear: true }, tireRearLeft: { treadDepth: '9' }, tireRearRight: { treadDepth: '9', flat: true } },
  interior_data: { frontSeats: 'stained', rearSeats: 'burned', interiorOdor: true, odorType: 'smoke' },
  engine_data: { brakeFluid: 'low', oilLevel: 'good', transmissionFluid: 'not_checked', visibleLeaks: true, leakDescription: 'oil at pan' },
  vehicle_function_data: { tests: { brakeLights: 'fail', radio: 'fail', horn: 'pass' } },
  documentation_data: { registrationCurrent: false, insurancePresent: true },
  keys_data: {}, bol_data: {},
}
const model = buildReportModel(inspection, calculateVehicleScore(inspection), [])
const fired = applyRules(model)
const has = (id: string) => fired.some(f => f.ruleId === id)
const urgencyOf = (id: string) => fired.find(f => f.ruleId === id)?.urgency

check('worn-out tire (2/32) is before road use', urgencyOf('tire.worn-out') === 'Before road use')
check('low tread (4/32) is soon', urgencyOf('tire.low-tread') === 'Soon')
check('flat tire fires', has('tire.flat'))
check('uneven wear fires', has('tire.uneven'))
check('cracked windshield is before road use', urgencyOf('glass.cracked') === 'Before road use')
check('failed brake lights are before road use', urgencyOf('test.brakeLights') === 'Before road use')
check('failed radio is only soon', urgencyOf('test.radio') === 'Soon')
check('passed horn does not fire', !has('test.horn'))
check('low brake fluid is before road use', urgencyOf('fluid.brake-low') === 'Before road use')
check('unchecked transmission fluid fires', has('fluid.transmissionFluid-unchecked'))
check('leak fires with its description', fired.find(f => f.ruleId === 'leak.visible')?.evidence.includes('oil at pan') === true)
check('stained seats become one detail job', fired.filter(f => f.ruleId === 'interior.detail').length === 1)
check('burned seat is its own repair', has('interior.rearSeats'))
check('odor fires', has('interior.odor'))
check('expired registration fires', has('docs.registration'))
check('insurance present does not fire', !has('docs.insurance'))
check('every rule has a source', fired.every(f => f.source?.name))
check('most urgent first', fired.findIndex(f => f.urgency === 'Reconditioning') > fired.findLastIndex(f => f.urgency === 'Before road use'))
check('a clean inspection fires nothing', applyRules(buildReportModel({ id: 'x', exterior_data: { glassCondition: 'good' }, interior_data: {}, engine_data: { oilLevel: 'good' }, vehicle_function_data: { tests: { horn: 'pass' } }, documentation_data: { registrationCurrent: true, insurancePresent: true } }, calculateVehicleScore({}), [])).length === 0)

// ── Validator ──────────────────────────────────────────────────────────────
const small = fired.filter(f => ['fluid.brake-low', 'leak.visible', 'interior.odor'].includes(f.ruleId))
const id = (ruleId: string) => { const f = small.find(x => x.ruleId === ruleId)!; return `${f.ruleId}#${f.evidence}` }
const good = JSON.stringify({ recommendations: [
  { action: 'Top up brake fluid and fix the oil leak', why: 'Brake fluid low, oil at pan', urgency: 'Before road use', ruleIds: [id('fluid.brake-low'), id('leak.visible')] },
  { action: 'Odor treatment', why: 'Smoke odor', urgency: 'Reconditioning', ruleIds: [id('interior.odor')] },
] })
check('a faithful answer passes', validateRecommendations(good, small).ok, validateRecommendations(good, small).problems.join('; '))
const invented = JSON.stringify({ recommendations: [...JSON.parse(good).recommendations, { action: 'Replace the timing belt', why: 'Age', urgency: 'Soon', ruleIds: ['engine.timing#age'] }] })
check('an invented recommendation fails', !validateRecommendations(invented, small).ok)
const dropped = JSON.stringify({ recommendations: [JSON.parse(good).recommendations[0]] })
check('a dropped rule fails', !validateRecommendations(dropped, small).ok)
const downgraded = JSON.stringify({ recommendations: [{ ...JSON.parse(good).recommendations[0], urgency: 'Soon' }, JSON.parse(good).recommendations[1]] })
check('a downgraded urgency fails', !validateRecommendations(downgraded, small).ok)
check('prose is not an answer', !validateRecommendations('You should fix the brakes.', small).ok)
check('the plain grouping covers every rule', groupRules(fired).length > 0 && groupRules(fired).every(r => r.source))

// ── Written summary guards (phase C) ───────────────────────────────────────
import('../../lib/ai/report-assist').then(({ numbersAreRecorded, makesUnsupportedClaim }) => {
  const facts = { odometerMiles: '69279', rules: ['Tire LF tread 2/32"'] }
  check('recorded numbers pass', numbersAreRecorded('Recorded at 69,279 miles; LF tread 2/32".', facts))
  check('an invented number fails', !numbersAreRecorded('About 3 years old.', facts))
  check('"mechanically sound" is refused', makesUnsupportedClaim('Mechanically sound with good tires.'))
  check('"safe to drive" is refused', makesUnsupportedClaim('The vehicle is safe to drive.'))
  check('"no issues" is refused', makesUnsupportedClaim('No issues found.'))
  check('"safety" alone is allowed', !makesUnsupportedClaim('Brake fluid is low, a safety item to fix first.'))
  check('a plain description is allowed', !makesUnsupportedClaim('Paint and glass are good; brake fluid is low.'))
  if (failures.length) { console.error(`\n${failures.length} failed`); process.exit(1) }
  console.log('\nAll rulebook checks passed.')
  process.exit(0)
})
