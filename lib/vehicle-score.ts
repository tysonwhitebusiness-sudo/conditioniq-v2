export interface ScoreBreakdown {
  exterior: number
  interior: number
  mechanical: number
  documentation: number
  mileage: number
  total: number
}

export interface ScoreResult {
  score: number
  grade: string
  description: string
  marketImpact: string
  breakdown: ScoreBreakdown
  recommendations: string[]
}

function gradeFromScore(score: number): string {
  if (score >= 95) return 'A+'
  if (score >= 90) return 'A'
  if (score >= 85) return 'B+'
  if (score >= 80) return 'B'
  if (score >= 75) return 'C+'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

export function getGrade(score: number): { letter: string; color: string } {
  const letter = gradeFromScore(score)
  const colors: Record<string, string> = {
    'A+': '#059669', A: '#10b981', 'B+': '#22c55e', B: '#4ade80',
    'C+': '#eab308', C: '#f59e0b', D: '#f97316', F: '#ef4444',
  }
  return { letter, color: colors[letter] ?? '#6b7280' }
}

function descFromGrade(grade: string): string {
  const map: Record<string, string> = {
    'A+': 'Excellent condition', 'A': 'Very good condition', 'B+': 'Good condition',
    'B': 'Above average', 'C+': 'Average condition', 'C': 'Below average',
    'D': 'Poor condition', 'F': 'Needs significant work',
  }
  return map[grade] ?? 'Unknown'
}

function marketImpactFromScore(score: number): string {
  if (score >= 90) return '+5-10%'
  if (score >= 80) return 'Market rate'
  if (score >= 70) return '-5-10%'
  if (score >= 60) return '-10-20%'
  return '-20-30%'
}

export function calculateVehicleScore(data: Record<string, any>): ScoreResult {
  const exterior_data = data.exterior_data ?? {}
  const interior_data = data.interior_data ?? {}
  const engine_data = data.engine_data ?? {}
  const vehicle_function_data = data.vehicle_function_data ?? {}
  const documentation_data = data.documentation_data ?? {}
  const bol_data = data.bol_data ?? {}
  const keys_data = data.keys_data ?? {}

  let exteriorScore = 25
  let interiorScore = 20
  let mechanicalScore = 30
  let documentationScore = 15
  let mileageScore = 10

  const recs: string[] = []

  // --- EXTERIOR (25 pts) ---
  const overallExt = exterior_data.overallCondition
  if (overallExt === 'fair') { exteriorScore -= 5; recs.push('Address exterior wear') }
  else if (overallExt === 'poor') { exteriorScore -= 12; recs.push('Exterior restoration needed') }

  const paint = exterior_data.paintCondition
  if (paint === 'faded') exteriorScore -= 2
  else if (paint === 'scratched') exteriorScore -= 3
  else if (paint === 'dented') exteriorScore -= 5
  else if (paint === 'peeling') { exteriorScore -= 7; recs.push('Paint restoration needed') }

  const glass = exterior_data.glassCondition
  if (glass === 'chipped') exteriorScore -= 3
  else if (glass === 'cracked') { exteriorScore -= 6; recs.push('Glass repair/replacement needed') }
  else if (glass === 'shattered') { exteriorScore -= 10; recs.push('Immediate glass replacement') }

  const tires = ['tireFrontLeft', 'tireFrontRight', 'tireRearLeft', 'tireRearRight']
  tires.forEach(t => {
    const tire = exterior_data[t] ?? {}
    if (tire.flat) { exteriorScore -= 3; recs.push('Replace flat tire') }
    else if (tire.unevenWear) exteriorScore -= 1
    const tread = parseInt(tire.treadDepth ?? '10')
    if (tread <= 2) { exteriorScore -= 3; recs.push('Tire replacement needed (low tread)') }
    else if (tread <= 4) exteriorScore -= 1
  })

  exteriorScore = Math.max(0, exteriorScore)

  // --- INTERIOR (20 pts) ---
  const overallInt = interior_data.overallCondition
  if (overallInt === 'fair') interiorScore -= 4
  else if (overallInt === 'poor') { interiorScore -= 10; recs.push('Interior refurbishment needed') }

  const seats = interior_data.frontSeats
  if (seats === 'stained') interiorScore -= 2
  else if (seats === 'torn' || seats === 'burned') { interiorScore -= 4; recs.push('Seat repair/replacement') }

  const carpet = interior_data.carpetFloor
  if (carpet === 'stained') interiorScore -= 1
  else if (carpet === 'torn' || carpet === 'wet') interiorScore -= 3

  const dash = interior_data.dashboard
  if (dash === 'cracked') interiorScore -= 2
  else if (dash === 'warning_lights') { interiorScore -= 4; recs.push('Warning lights require diagnostic') }

  const headliner = interior_data.headliner
  if (headliner === 'sagging' || headliner === 'torn') interiorScore -= 2

  if (interior_data.interiorOdor) { interiorScore -= 3; recs.push('Odor treatment needed') }

  interiorScore = Math.max(0, interiorScore)

  // --- MECHANICAL (30 pts) ---
  const funcTests = vehicle_function_data.tests ?? {}
  let failCount = 0
  Object.values(funcTests).forEach((v: any) => { if (v === 'fail') failCount++ })
  mechanicalScore -= Math.min(15, failCount * 2)
  if (failCount > 0) recs.push(`${failCount} function test(s) failed — requires inspection`)

  const oil = engine_data.oilLevel
  if (oil === 'low') { mechanicalScore -= 3; recs.push('Top up engine oil') }
  else if (oil === 'overfull') mechanicalScore -= 1

  const coolant = engine_data.coolantLevel
  if (coolant === 'low') { mechanicalScore -= 2; recs.push('Top up coolant') }

  const brakeFluid = engine_data.brakeFluid
  if (brakeFluid === 'low') { mechanicalScore -= 2; recs.push('Brake fluid low — safety concern') }

  const battery = engine_data.batteryCondition
  if (battery === 'fair') mechanicalScore -= 2
  else if (battery === 'poor') { mechanicalScore -= 4; recs.push('Battery replacement recommended') }

  const belts = engine_data.beltCondition
  if (belts === 'worn') mechanicalScore -= 2
  else if (belts === 'cracked') { mechanicalScore -= 4; recs.push('Belt replacement needed') }

  if (engine_data.visibleLeaks) { mechanicalScore -= 5; recs.push('Address fluid leak immediately') }
  if (engine_data.unusualNoise) { mechanicalScore -= 3; recs.push('Unusual engine noise — diagnostic needed') }

  mechanicalScore = Math.max(0, mechanicalScore)

  // --- DOCUMENTATION (15 pts) ---
  if (!bol_data.bolPresent) { documentationScore -= 5; recs.push('BOL missing') }
  if (!documentation_data.registrationCurrent) { documentationScore -= 4; recs.push('Registration not current') }
  if (!documentation_data.insurancePresent) documentationScore -= 3
  const totalKeys = (keys_data.mechanicalKeys ?? 0) + (keys_data.keyFobs ?? 0)
  if (totalKeys === 0) documentationScore -= 3

  documentationScore = Math.max(0, documentationScore)

  // --- MILEAGE (10 pts) ---
  const odometer = parseInt((data.vehicleInfo?.odometer ?? '0').replace(/,/g, ''))
  if (odometer > 200000) mileageScore -= 6
  else if (odometer > 150000) mileageScore -= 4
  else if (odometer > 100000) mileageScore -= 2

  mileageScore = Math.max(0, mileageScore)

  const total = exteriorScore + interiorScore + mechanicalScore + documentationScore + mileageScore
  const grade = gradeFromScore(total)

  return {
    score: total,
    grade,
    description: descFromGrade(grade),
    marketImpact: marketImpactFromScore(total),
    breakdown: {
      exterior: exteriorScore,
      interior: interiorScore,
      mechanical: mechanicalScore,
      documentation: documentationScore,
      mileage: mileageScore,
      total,
    },
    recommendations: Array.from(new Set(recs)).slice(0, 5),
  }
}
