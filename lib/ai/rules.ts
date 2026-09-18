import type { ReportModel, RecommendationUrgency } from '@/lib/report/model'
import { treadDepth, isFlat, isUneven, TIRE_POSITIONS, TEST_NAMES } from '@/lib/report/findings'

// B4 · The recommendation rulebook.
//
// Recommendations come from rules, not from the model. Every rule is a check on
// what the inspector recorded, the action it calls for, how urgent it is, the
// kind of reconditioning work, and the source it rests on. The AI's only job
// (phase C) is to group and word the rules that fired; the lab checks that
// every recommendation it writes traces back to one of these, a recorded item
// or a recall.

export type RecondCategory =
  | 'Tires' | 'Brakes' | 'Lights and signals' | 'Visibility' | 'Fluids and leaks' | 'Engine and electrical'
  | 'Paintless dent repair' | 'Body and paint' | 'Glass' | 'Interior' | 'Paperwork'

export interface Source { id: string; name: string }

export const SOURCES: Record<string, Source> = {
  shp478: { id: 'shp478', name: 'Missouri State Highway Patrol, Motor Vehicle Safety Inspection Manual (SHP-478)' },
  nhtsaTires: { id: 'nhtsaTires', name: 'NHTSA TireWise: tread wear indicators at 2/32 inch' },
  fordWear: { id: 'fordWear', name: 'Ford Credit Wear and Use Guidelines' },
  m22: { id: 'm22', name: 'AIAG-ECG M-22 damage code tables v5' },
  ownersManual: { id: 'ownersManual', name: "Vehicle manufacturer's owner's manual (fluid type and level)" },
  naaa: { id: 'naaa', name: 'NAAA Vehicle Condition Grading Scale' },
  inspector: { id: 'inspector', name: 'Inspector note' },
}

export interface FiredRule {
  ruleId: string
  action: string
  urgency: RecommendationUrgency
  category: RecondCategory
  source: Source
  /** What was recorded that made the rule fire, e.g. "Tire LF tread 2/32\"". */
  evidence: string
}

type Rule = (m: ReportModel) => FiredRule[]

const fire = (ruleId: string, action: string, urgency: RecommendationUrgency, category: RecondCategory, source: Source, evidence: string): FiredRule =>
  ({ ruleId, action, urgency, category, source, evidence })

const words = (v: unknown) => String(v ?? '').replace(/_/g, ' ')

const RULES: Rule[] = [
  // ── Tires ────────────────────────────────────────────────────────────────
  m => TIRE_POSITIONS.flatMap(([name, pos]) => {
    const e = m.sections.exterior
    const out: FiredRule[] = []
    if (isFlat(e, pos)) out.push(fire('tire.flat', `Repair or replace the ${name} tire`, 'Before road use', 'Tires', SOURCES.shp478, `Tire ${name} flat`))
    const tread = treadDepth(e, pos)
    if (tread !== null && tread <= 2) out.push(fire('tire.worn-out', `Replace the ${name} tire`, 'Before road use', 'Tires', SOURCES.nhtsaTires, `Tire ${name} tread ${tread}/32"`))
    else if (tread !== null && tread <= 4) out.push(fire('tire.low-tread', `Plan to replace the ${name} tire`, 'Soon', 'Tires', SOURCES.nhtsaTires, `Tire ${name} tread ${tread}/32"`))
    if (isUneven(e, pos)) out.push(fire('tire.uneven', 'Check alignment and tire pressure', 'Soon', 'Tires', SOURCES.shp478, `Tire ${name} uneven wear`))
    return out
  }),

  // ── Function tests ───────────────────────────────────────────────────────
  m => Object.entries(m.tests).filter(([, r]) => r === 'fail').map(([key]) => {
    const name = TEST_NAMES[key] ?? key
    const safety: Record<string, [string, RecondCategory]> = {
      brakeLights: ['Repair the brake lights', 'Lights and signals'], headlights: ['Repair the headlights', 'Lights and signals'],
      taillights: ['Repair the taillights', 'Lights and signals'], turnSignals: ['Repair the turn signals', 'Lights and signals'],
      hazardLights: ['Repair the hazard lights', 'Lights and signals'], horn: ['Repair the horn', 'Engine and electrical'],
      wipers: ['Repair the wipers', 'Visibility'], mirrors: ['Repair or replace the mirror', 'Visibility'],
      parkingBrake: ['Repair the parking brake', 'Brakes'], shiftsToD: ['Have the transmission diagnosed', 'Engine and electrical'],
      shiftsToR: ['Have the transmission diagnosed', 'Engine and electrical'], engineStarts: ['Diagnose the no-start', 'Engine and electrical'],
    }
    const hit = safety[key]
    return hit
      ? fire(`test.${key}`, hit[0], 'Before road use', hit[1], SOURCES.shp478, `${name} failed`)
      : fire(`test.${key}`, `Repair the ${name.toLowerCase()}`, 'Soon', 'Engine and electrical', SOURCES.inspector, `${name} failed`)
  }),

  // ── Under the hood ───────────────────────────────────────────────────────
  m => {
    const g = m.sections.engine
    const out: FiredRule[] = []
    if (g.brakeFluid === 'low') out.push(fire('fluid.brake-low', 'Top up brake fluid and check the system for a leak', 'Before road use', 'Brakes', SOURCES.ownersManual, 'Brake fluid low'))
    if (g.oilLevel === 'low') out.push(fire('fluid.oil-low', 'Top up engine oil to the level in the owner\'s manual', 'Before road use', 'Fluids and leaks', SOURCES.ownersManual, 'Oil low'))
    if (g.coolantLevel === 'low') out.push(fire('fluid.coolant-low', 'Top up coolant and check for a leak', 'Before road use', 'Fluids and leaks', SOURCES.ownersManual, 'Coolant low'))
    if (g.transmissionFluid === 'low') out.push(fire('fluid.trans-low', 'Top up transmission fluid and check for a leak', 'Soon', 'Fluids and leaks', SOURCES.ownersManual, 'Transmission fluid low'))
    for (const [key, name] of [['oilLevel', 'oil'], ['coolantLevel', 'coolant'], ['brakeFluid', 'brake fluid'], ['transmissionFluid', 'transmission fluid']] as const) {
      if (g[key] === 'not_checked') out.push(fire(`fluid.${key}-unchecked`, `Check the ${name} level`, 'Soon', 'Fluids and leaks', SOURCES.ownersManual, `${name[0].toUpperCase()}${name.slice(1)} not checked`))
    }
    if (g.visibleLeaks) out.push(fire('leak.visible', 'Find and repair the leak', 'Before road use', 'Fluids and leaks', SOURCES.shp478, g.leakDescription ? `Leak: ${g.leakDescription}` : 'Visible leak'))
    if (g.checkEngineLight) out.push(fire('engine.cel', 'Read the engine fault codes and repair', 'Soon', 'Engine and electrical', SOURCES.inspector, 'Check engine light on'))
    if (g.unusualNoise) out.push(fire('engine.noise', 'Have the engine noise diagnosed', 'Soon', 'Engine and electrical', SOURCES.inspector, g.noiseType ? `Engine noise: ${words(g.noiseType)}` : 'Unusual engine noise'))
    if (g.batteryCondition === 'poor') out.push(fire('battery.poor', 'Test and replace the battery', 'Soon', 'Engine and electrical', SOURCES.ownersManual, 'Battery poor'))
    if (g.beltCondition === 'cracked' || g.beltCondition === 'worn') out.push(fire('belt.worn', 'Replace the drive belt', g.beltCondition === 'cracked' ? 'Before road use' : 'Soon', 'Engine and electrical', SOURCES.ownersManual, `Belts ${g.beltCondition}`))
    return out
  },

  // ── Glass and visibility ─────────────────────────────────────────────────
  m => {
    const e = m.sections.exterior
    const pane = e.glassDamagedPane ?? e.glassDamageLocation
    const where = pane ? ` (${pane})` : ''
    if (e.glassCondition === 'shattered' || e.glassCondition === 'cracked') {
      const windshield = !pane || /windshield/i.test(String(pane))
      return [fire('glass.cracked', `Replace the ${pane ? String(pane).toLowerCase() : 'damaged glass'}`, windshield ? 'Before road use' : 'Soon', 'Glass', SOURCES.shp478, `Glass ${e.glassCondition}${where}`)]
    }
    if (e.glassCondition === 'chipped') return [fire('glass.chipped', 'Repair the glass chip before it spreads', 'Soon', 'Glass', SOURCES.fordWear, `Glass chipped${where}`)]
    return []
  },

  // ── Body damage ──────────────────────────────────────────────────────────
  m => m.pins.map(pin => {
    const type = (pin.type ?? '').toLowerCase()
    const sev = pin.severityCode
    const where = pin.area ?? 'the panel'
    const evidence = `Damage ${pin.number}: ${pin.area ?? '—'}, ${pin.type ?? '—'}, ${pin.severity ?? '—'}`
    if (/glass/.test(type)) return fire('damage.glass', `Repair or replace the glass at ${where}`, 'Soon', 'Glass', SOURCES.m22, evidence)
    if (/dent/.test(type) && /not damaged/.test(type)) {
      return fire('damage.dent-pdr', `Paintless dent repair at ${where}`, 'Reconditioning', (sev ?? 0) >= 4 ? 'Body and paint' : 'Paintless dent repair', SOURCES.m22, evidence)
    }
    if (/missing/.test(type)) return fire('damage.missing', `Replace the missing part at ${where}`, 'Soon', 'Body and paint', SOURCES.m22, evidence)
    return fire('damage.body', `Body and paint repair at ${where}`, 'Reconditioning', 'Body and paint', SOURCES.m22, evidence)
  }),

  // ── Interior ─────────────────────────────────────────────────────────────
  m => {
    const n = m.sections.interior
    const out: FiredRule[] = []
    const worn = [['frontSeats', 'Front seats'], ['rearSeats', 'Rear seats'], ['headliner', 'Headliner'], ['carpetFloor', 'Carpet'], ['carpet', 'Carpet']]
      .filter(([k]) => n[k] && n[k] !== 'good')
    const stained = worn.filter(([k]) => n[k] === 'stained')
    const damaged = worn.filter(([k]) => ['torn', 'burned', 'sagging', 'wet'].includes(n[k]))
    if (stained.length) out.push(fire('interior.detail', 'Interior detail and shampoo', 'Reconditioning', 'Interior', SOURCES.naaa, stained.map(([k, l]) => `${l} ${words(n[k])}`).join(', ')))
    for (const [k, l] of damaged) out.push(fire(`interior.${k}`, `Repair the ${l.toLowerCase()} (${words(n[k])})`, 'Reconditioning', 'Interior', SOURCES.fordWear, `${l} ${words(n[k])}`))
    if (n.interiorOdor) out.push(fire('interior.odor', 'Odor treatment', 'Reconditioning', 'Interior', SOURCES.naaa, `Odor present${n.odorType ? ` (${words(n.odorType)})` : ''}`))
    if (n.dashboard === 'warning_lights') out.push(fire('interior.warning-lights', 'Read the fault codes behind the dashboard warning lights', 'Soon', 'Engine and electrical', SOURCES.inspector, 'Dashboard warning lights'))
    return out
  },

  // ── Paperwork ────────────────────────────────────────────────────────────
  m => {
    const d = m.sections.documentation
    const out: FiredRule[] = []
    if (d.registrationCurrent === false) out.push(fire('docs.registration', 'Renew the registration before the vehicle is driven', 'Before road use', 'Paperwork', SOURCES.shp478, 'Registration not current'))
    if (d.insurancePresent === false) out.push(fire('docs.insurance', 'Put proof of insurance in the vehicle', 'Before road use', 'Paperwork', SOURCES.shp478, 'Insurance not present'))
    return out
  },
]

/** Every rule that the recorded inspection sets off, most urgent first. */
export function applyRules(model: ReportModel): FiredRule[] {
  const order: Record<RecommendationUrgency, number> = { 'Before road use': 0, Soon: 1, Reconditioning: 2 }
  const fired = RULES.flatMap(rule => rule(model))
  const seen = new Set<string>()
  return fired
    .filter(f => (seen.has(f.ruleId + f.evidence) ? false : (seen.add(f.ruleId + f.evidence), true)))
    .sort((a, b) => order[a.urgency] - order[b.urgency])
}
