import type { ReportModel } from './model'

// R3 · What page 1 says first.
//
// "Needs attention" and "Checked and OK" are read straight from what the
// inspector recorded — nothing is inferred. Serious items sort first, then
// cosmetic ones, then things that were simply not checked.

export type FindingLevel = 'risk' | 'warn' | 'note'

export interface Finding {
  text: string
  level: FindingLevel
  section: string
}

export const TEST_NAMES: Record<string, string> = {
  engineStarts: 'Engine start', shiftsToD: 'Shift to drive', shiftsToR: 'Shift to reverse', parkingBrake: 'Parking brake',
  headlights: 'Headlights', taillights: 'Taillights', turnSignals: 'Turn signals', brakeLights: 'Brake lights', hazardLights: 'Hazard lights',
  horn: 'Horn', wipers: 'Wipers', washerFluid: 'Washer fluid', ac: 'A/C', heater: 'Heater', radio: 'Radio',
  powerWindows: 'Power windows', powerLocks: 'Power locks', mirrors: 'Mirrors',
}

export const TIRE_POSITIONS: Array<[string, string]> = [['LF', 'tireFrontLeft'], ['RF', 'tireFrontRight'], ['LR', 'tireRearLeft'], ['RR', 'tireRearRight']]

const LEGACY_TREAD: Record<string, string> = { tireFrontLeft: 'tireTreadFL', tireFrontRight: 'tireTreadFR', tireRearLeft: 'tireTreadRL', tireRearRight: 'tireTreadRR' }

/** Tread depth in 32nds, read from either the current or the older field. */
export function treadDepth(exterior: Record<string, any>, position: string): number | null {
  const raw = exterior?.[position]?.treadDepth ?? exterior?.[LEGACY_TREAD[position]]
  const n = parseInt(String(raw ?? ''), 10)
  return isNaN(n) ? null : n
}

export function isFlat(exterior: Record<string, any>, position: string): boolean {
  const short = LEGACY_TREAD[position]?.replace('tireTread', 'tireFlat')
  return !!(exterior?.[position]?.flat ?? (short ? exterior?.[short] : false))
}

const LEGACY_SUFFIX: Record<string, string> = { tireFrontLeft: 'FL', tireFrontRight: 'FR', tireRearLeft: 'RL', tireRearRight: 'RR' }

export function isUneven(exterior: Record<string, any>, position: string): boolean {
  return !!(exterior?.[position]?.unevenWear ?? exterior?.[`tireUneven${LEGACY_SUFFIX[position]}`])
}

/** What was noted about one tire besides its tread: flat, uneven, or the older form's condition. */
export function tireNotes(exterior: Record<string, any>, position: string): string[] {
  const notes: string[] = []
  if (isFlat(exterior, position)) notes.push('Flat')
  if (isUneven(exterior, position)) notes.push('Uneven')
  const legacy = exterior?.[`tireCondition${LEGACY_SUFFIX[position]}`]
  if (typeof legacy === 'string' && legacy && legacy !== 'good' && !notes.length) notes.push(legacy.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()))
  return notes
}

const pretty = (v: unknown) => String(v).replace(/_/g, ' ').toLowerCase()

export function needsAttention(model: ReportModel): Finding[] {
  const { exterior: e, interior: n, engine: g } = model.sections
  const out: Finding[] = []
  const add = (text: string, level: FindingLevel, section: string) => out.push({ text, level, section })

  if (g.checkEngineLight) add('Check engine light on', 'risk', 'Under hood')
  if (g.visibleLeaks) add(g.leakDescription ? `Visible leak: ${g.leakDescription}` : 'Visible leak', 'risk', 'Under hood')
  if (g.unusualNoise) add(g.noiseType ? `Unusual engine noise (${pretty(g.noiseType)})` : 'Unusual engine noise', 'risk', 'Under hood')
  for (const [key, name] of [['oilLevel', 'Oil'], ['coolantLevel', 'Coolant'], ['brakeFluid', 'Brake fluid'], ['transmissionFluid', 'Transmission fluid']]) {
    if (g[key] === 'low') add(`${name} low`, 'risk', 'Under hood')
  }
  for (const [key, result] of Object.entries(model.tests)) {
    if (result === 'fail') add(`${TEST_NAMES[key] ?? key} failed`, 'risk', 'Function tests')
  }
  for (const [name, position] of TIRE_POSITIONS) {
    if (isFlat(e, position)) add(`Tire ${name} flat`, 'risk', 'Tires')
    const tread = treadDepth(e, position)
    if (tread !== null && tread < 4) add(`Tire ${name} tread ${tread}/32"`, tread < 3 ? 'risk' : 'warn', 'Tires')
    if (isUneven(e, position)) add(`Tire ${name} uneven wear`, 'note', 'Tires')
  }
  if (model.gauges?.odometerStatus === 'mismatch' && model.gauges.odometerRead != null) {
    add(`Odometer photo reads ${model.gauges.odometerRead.toLocaleString('en-US')} ${model.gauges.unit ?? 'mi'}`, 'warn', 'Odometer')
  }
  if (model.pins.length) add(`${model.pins.length} damage ${model.pins.length === 1 ? 'item' : 'items'} recorded`, 'warn', 'Damage')
  if (n.interiorOdor) add(`Odor present${n.odorType && n.odorType !== 'other' ? ` (${pretty(n.odorType)})` : ''}`, 'warn', 'Interior')
  for (const [key, name] of [['frontSeats', 'Front seats'], ['rearSeats', 'Rear seats'], ['headliner', 'Headliner'], ['carpetFloor', 'Carpet'], ['carpet', 'Carpet'], ['dashboard', 'Dashboard'], ['steeringWheel', 'Steering wheel']]) {
    const v = n[key]
    if (v && v !== 'good') add(`${name} ${pretty(v)}`, v === 'burned' || v === 'torn' ? 'warn' : 'note', 'Interior')
  }
  for (const [key, name] of [['paintCondition', 'Paint'], ['glassCondition', 'Glass']]) {
    const v = e[key]
    if (v && v !== 'good') add(`${name} ${pretty(v)}`, 'warn', 'Exterior')
  }
  for (const [key, name] of [['oilLevel', 'Oil'], ['coolantLevel', 'Coolant'], ['brakeFluid', 'Brake fluid'], ['transmissionFluid', 'Transmission fluid']]) {
    if (g[key] === 'not_checked') add(`${name} not checked`, 'note', 'Under hood')
  }

  // One line per text: the carpet can be recorded under either field name.
  const seen = new Set<string>()
  const unique = out.filter(f => (seen.has(f.text) ? false : (seen.add(f.text), true)))
  const order: Record<FindingLevel, number> = { risk: 0, warn: 1, note: 2 }
  return unique.sort((a, b) => order[a.level] - order[b.level])
}

export function checkedOk(model: ReportModel): string[] {
  const { exterior: e, engine: g } = model.sections
  const results = Object.values(model.tests)
  const ok: string[] = []
  if (results.length && results.every(r => r === 'pass')) ok.push(`All ${results.length} function tests passed`)
  if (e.paintCondition === 'good') ok.push('Paint good')
  if (e.glassCondition === 'good') ok.push('Glass good')
  const treads = TIRE_POSITIONS.map(([, p]) => treadDepth(e, p)).filter((t): t is number => t !== null)
  if (treads.length === 4 && Math.min(...treads) >= 6) {
    const lo = Math.min(...treads), hi = Math.max(...treads)
    ok.push(lo === hi ? `Tires ${lo}/32"` : `Tires ${lo}–${hi}/32"`)
  }
  if (g.oilLevel === 'good' && g.coolantLevel === 'good') ok.push('Oil and coolant good')
  if (['batteryCondition', 'beltCondition', 'hoseCondition'].every(k => g[k] === 'good')) ok.push('Battery, belts, hoses good')
  if (!g.checkEngineLight && g.checkEngineLight !== undefined) ok.push('No check engine light')
  return ok
}

// ── VIN check digit (position 9, North American VINs) ─────────────────────
const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
}
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]

export function vinCheckDigitValid(vin: string | null | undefined): boolean {
  if (!vin || !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin.toUpperCase())) return false
  const v = vin.toUpperCase()
  let sum = 0
  for (let i = 0; i < 17; i++) {
    const c = v[i]
    sum += (/\d/.test(c) ? Number(c) : TRANSLITERATION[c]) * WEIGHTS[i]
  }
  const remainder = sum % 11
  return v[8] === (remainder === 10 ? 'X' : String(remainder))
}

export const DISCLOSURE =
  "This report records the vehicle's visible condition and the results of basic operating checks at the date and time shown. " +
  'It is not a warranty, a guarantee, a safety or roadworthiness certification, or a repair estimate. ' +
  'A visual inspection cannot reliably identify mechanical, electrical, structural, driver-assistance (ADAS) or hybrid and electric battery conditions; those require a qualified technician and equipment. ' +
  'Vehicle details such as trim, body and engine are decoded from the VIN using NHTSA data and were not independently verified. ' +
  'Damage is recorded using AIAG area, type and severity codes; severity is the approximate size of the damage.'

export const AI_DISCLOSURE =
  'The summary, recommendations and photo checks in this report are generated with AI assistance from the recorded inspection and are reviewed by the inspector before the report is issued.'
