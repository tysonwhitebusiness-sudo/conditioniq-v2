'use client'

import type { ScoreResult } from './vehicle-score'

const NAVY = '#1e3a5f'
const ORANGE = '#dc5010'
const LIGHT_GRAY = '#f8f9fa'
const DARK_GRAY = '#333333'
const MID_GRAY = '#666666'
const GREEN = '#16a34a'
const RED = '#dc2626'
const YELLOW = '#d97706'

function drawScoreRing(
  jspdf: any,
  x: number,
  y: number,
  r: number,
  score: number,
  grade: string,
  gradeColor: string
) {
  const total = 100
  const pct = score / total
  const circumference = 2 * Math.PI * r
  jspdf.setDrawColor(230, 230, 230)
  jspdf.setLineWidth(3)
  jspdf.circle(x, y, r, 'S')
  const segments = Math.floor(pct * 36)
  jspdf.setDrawColor(gradeColor)
  for (let i = 0; i < segments; i++) {
    const angle = ((i * 10 - 90) * Math.PI) / 180
    const x1 = x + (r - 1.5) * Math.cos(angle)
    const y1 = y + (r - 1.5) * Math.sin(angle)
    const x2 = x + (r + 1.5) * Math.cos(angle)
    const y2 = y + (r + 1.5) * Math.sin(angle)
    jspdf.line(x1, y1, x2, y2)
  }
  jspdf.setFontSize(14)
  jspdf.setTextColor(gradeColor)
  jspdf.setFont('helvetica', 'bold')
  jspdf.text(grade, x, y - 2, { align: 'center' })
  jspdf.setFontSize(9)
  jspdf.setTextColor(MID_GRAY)
  jspdf.setFont('helvetica', 'normal')
  jspdf.text(`${score}/100`, x, y + 5, { align: 'center' })
}

function gradeColor(grade: string): string {
  if (grade.startsWith('A')) return GREEN
  if (grade.startsWith('B')) return '#2563eb'
  if (grade.startsWith('C')) return YELLOW
  return RED
}

function barColor(pct: number): string {
  if (pct >= 0.8) return GREEN
  if (pct >= 0.6) return YELLOW
  return RED
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) }
  catch { return iso }
}

export async function generateInspectionPDF(
  inspectionData: Record<string, any>,
  scoreResult: ScoreResult,
  signatureUrl: string
): Promise<void> {
  const { jsPDF } = await import('jspdf')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210
  const H = 297

  const vehicleInfo = inspectionData.vehicleInfo ?? {}
  const bol_data = inspectionData.bol_data ?? {}
  const keys_data = inspectionData.keys_data ?? {}
  const exterior_data = inspectionData.exterior_data ?? {}
  const interior_data = inspectionData.interior_data ?? {}
  const engine_data = inspectionData.engine_data ?? {}
  const vehicle_function_data = inspectionData.vehicle_function_data ?? {}
  const documentation_data = inspectionData.documentation_data ?? {}

  const vehicleName = `${vehicleInfo.year ?? ''} ${vehicleInfo.make ?? ''} ${vehicleInfo.model ?? ''}`.trim()
  const inspDate = formatDate(inspectionData.timestamp ?? new Date().toISOString())

  // ==================== PAGE 1 — COVER ====================
  // Header
  doc.setFillColor(NAVY)
  doc.rect(0, 0, W, 44, 'F')
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#ffffff')
  doc.text('Condition IQ', 15, 20)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('Vehicle Inspection Report', 15, 30)
  doc.setFontSize(9)
  doc.text(`Inspector: ${inspectionData.inspectorName ?? 'N/A'}   |   ${inspDate}`, 15, 39)

  // Vehicle card
  doc.setFillColor(LIGHT_GRAY)
  doc.roundedRect(10, 50, W - 20, 22, 2, 2, 'F')
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(NAVY)
  doc.text(vehicleName || 'Unknown Vehicle', 15, 60)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(MID_GRAY)
  const vehicleDetails = [
    vehicleInfo.vin ? `VIN: ${vehicleInfo.vin}` : null,
    vehicleInfo.odometer ? `Odometer: ${vehicleInfo.odometer} mi` : null,
    vehicleInfo.location ? `Location: ${vehicleInfo.location}` : null,
    vehicleInfo.assetId ? `Asset ID: ${vehicleInfo.assetId}` : null,
  ].filter(Boolean).join('   |   ')
  doc.text(vehicleDetails, 15, 68)

  // Score ring
  const gColor = gradeColor(scoreResult.grade)
  drawScoreRing(doc, W - 35, 100, 18, scoreResult.score, scoreResult.grade, gColor)

  // Category bars
  const cats = [
    { label: 'Exterior', score: scoreResult.breakdown.exterior, max: 25 },
    { label: 'Interior', score: scoreResult.breakdown.interior, max: 20 },
    { label: 'Mechanical', score: scoreResult.breakdown.mechanical, max: 30 },
    { label: 'Documentation', score: scoreResult.breakdown.documentation, max: 15 },
    { label: 'Mileage', score: scoreResult.breakdown.mileage, max: 10 },
  ]
  let catY = 80
  cats.forEach(cat => {
    const pct = cat.max > 0 ? cat.score / cat.max : 0
    doc.setFontSize(7)
    doc.setTextColor(DARK_GRAY)
    doc.text(cat.label, W - 75, catY)
    doc.text(`${cat.score}/${cat.max}`, W - 20, catY, { align: 'right' })
    doc.setFillColor(220, 220, 220)
    doc.roundedRect(W - 75, catY + 1, 38, 3, 1, 1, 'F')
    doc.setFillColor(barColor(pct))
    doc.roundedRect(W - 75, catY + 1, 38 * pct, 3, 1, 1, 'F')
    catY += 9
  })

  // Stat chips
  const chips = [
    { label: 'BOL', value: bol_data.bolPresent ? 'Present' : 'Missing' },
    { label: 'Keys', value: `${(keys_data.mechanicalKeys ?? 0) + (keys_data.keyFobs ?? 0)}` },
    { label: 'Damage', value: `${(exterior_data.damages ?? []).length + (interior_data.damages ?? []).length}` },
    { label: 'Tests', value: `${Object.values(vehicle_function_data.tests ?? {}).filter(v => v === 'pass').length} pass` },
  ]
  let chipX = 15
  chips.forEach(chip => {
    doc.setFillColor(NAVY)
    doc.roundedRect(chipX, 130, 38, 12, 2, 2, 'F')
    doc.setFontSize(7)
    doc.setTextColor('#ffffff')
    doc.text(chip.label, chipX + 19, 135, { align: 'center' })
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(chip.value, chipX + 19, 140, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    chipX += 42
  })

  // Action Plan
  if (scoreResult.recommendations.length > 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(NAVY)
    doc.text('Action Plan', 15, 155)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(DARK_GRAY)
    scoreResult.recommendations.slice(0, 3).forEach((rec, i) => {
      doc.setFillColor(ORANGE)
      doc.circle(18, 162 + i * 8, 1.5, 'F')
      doc.text(rec, 22, 163 + i * 8)
    })
  }

  // ==================== PAGE 2 — SPECS & DOCUMENTATION ====================
  doc.addPage()
  doc.setFillColor(NAVY)
  doc.rect(0, 0, W, 16, 'F')
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#ffffff')
  doc.text('Vehicle Specs & Documentation', 15, 11)

  doc.setTextColor(DARK_GRAY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)

  const specs = [
    ['Year', vehicleInfo.year], ['Make', vehicleInfo.make], ['Model', vehicleInfo.model],
    ['VIN', vehicleInfo.vin], ['Odometer', vehicleInfo.odometer ? `${vehicleInfo.odometer} mi` : ''],
    ['Location', vehicleInfo.location], ['Asset ID', vehicleInfo.assetId],
    ['Inspection Date', inspDate], ['Inspector', inspectionData.inspectorName],
    ['Trim', vehicleInfo.advancedInfo?.trim], ['Body', vehicleInfo.advancedInfo?.bodyClass],
    ['Drive', vehicleInfo.advancedInfo?.driveType], ['Engine', vehicleInfo.advancedInfo?.cylinders ? `${vehicleInfo.advancedInfo.cylinders} cyl` : ''],
    ['Transmission', vehicleInfo.advancedInfo?.transmissionStyle], ['Fuel', vehicleInfo.advancedInfo?.fuelType],
  ].filter(([, v]) => v)

  let specY = 25
  specs.forEach(([label, value], i) => {
    if (i % 2 === 0) {
      doc.setFillColor(LIGHT_GRAY)
      doc.rect(10, specY - 4, W - 20, 7, 'F')
    }
    doc.setFont('helvetica', 'bold')
    doc.text(String(label), 14, specY)
    doc.setFont('helvetica', 'normal')
    doc.text(String(value ?? ''), 70, specY)
    specY += 7
  })

  // Documentation section
  specY += 6
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(NAVY)
  doc.text('Documentation & Keys', 15, specY)
  specY += 8

  const docItems = [
    { label: 'BOL Present', ok: !!bol_data.bolPresent },
    { label: 'Registration Current', ok: !!documentation_data.registrationCurrent },
    { label: 'Insurance Present', ok: !!documentation_data.insurancePresent },
  ]
  docItems.forEach(item => {
    doc.setFillColor(item.ok ? GREEN : RED)
    doc.roundedRect(14, specY - 4, 22, 6, 1, 1, 'F')
    doc.setFontSize(7)
    doc.setTextColor('#ffffff')
    doc.text(item.ok ? 'YES' : 'NO', 25, specY, { align: 'center' })
    doc.setTextColor(DARK_GRAY)
    doc.setFontSize(8)
    doc.text(item.label, 40, specY)
    specY += 9
  })

  doc.setFontSize(8)
  doc.setTextColor(DARK_GRAY)
  doc.text(`Mechanical Keys: ${keys_data.mechanicalKeys ?? 0}`, 14, specY)
  doc.text(`Key Fobs: ${keys_data.keyFobs ?? 0}`, 80, specY)
  if (documentation_data.licensePlate) doc.text(`Plate: ${documentation_data.licensePlate}`, 130, specY)

  // ==================== PAGE 3 — FUNCTION TESTS ====================
  doc.addPage()
  doc.setFillColor(NAVY)
  doc.rect(0, 0, W, 16, 'F')
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#ffffff')
  doc.text('Function Tests', 15, 11)

  const testGroups = [
    { name: 'Starting & Drivetrain', tests: ['engineStarts', 'shiftsToD', 'shiftsToR', 'parkingBrake'] },
    { name: 'Lights', tests: ['headlights', 'taillights', 'turnSignals', 'brakeLights', 'hazardLights'] },
    { name: 'Controls', tests: ['horn', 'wipers', 'washerFluid', 'ac', 'heater', 'radio'] },
    { name: 'Windows & Locks', tests: ['powerWindows', 'powerLocks', 'mirrors'] },
  ]

  const TEST_LABELS: Record<string, string> = {
    engineStarts: 'Engine Starts', shiftsToD: 'Shifts to D', shiftsToR: 'Shifts to R',
    parkingBrake: 'Parking Brake', headlights: 'Headlights', taillights: 'Taillights',
    turnSignals: 'Turn Signals', brakeLights: 'Brake Lights', hazardLights: 'Hazard Lights',
    horn: 'Horn', wipers: 'Wipers', washerFluid: 'Washer Fluid', ac: 'A/C',
    heater: 'Heater', radio: 'Radio', powerWindows: 'Power Windows',
    powerLocks: 'Power Locks', mirrors: 'Mirrors',
  }

  const tests = vehicle_function_data.tests ?? {}
  let testY = 25

  testGroups.forEach(group => {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(NAVY)
    doc.text(group.name, 15, testY)
    testY += 6

    let col = 0
    group.tests.forEach(testKey => {
      const status = tests[testKey] ?? 'not_tested'
      const x = 15 + col * 46
      const statusColor = status === 'pass' ? GREEN : status === 'fail' ? RED : '#9ca3af'
      doc.setFillColor(statusColor)
      doc.roundedRect(x, testY - 4, 44, 8, 1, 1, 'F')
      doc.setFontSize(7)
      doc.setTextColor('#ffffff')
      doc.setFont('helvetica', 'bold')
      doc.text(TEST_LABELS[testKey] ?? testKey, x + 22, testY - 0.5, { align: 'center' })
      doc.setFont('helvetica', 'normal')
      doc.text(status.toUpperCase().replace('_', ' '), x + 22, testY + 3, { align: 'center' })
      col++
      if (col >= 4) { col = 0; testY += 10 }
    })
    if (col > 0) testY += 10
    testY += 4
  })

  // Summary
  const allTests = Object.values(tests)
  const passCount = allTests.filter(v => v === 'pass').length
  const failCount = allTests.filter(v => v === 'fail').length
  const ntCount = allTests.filter(v => v === 'not_tested').length

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(DARK_GRAY)
  doc.text(`Summary: ${passCount} Pass  ${failCount} Fail  ${ntCount} Not Tested`, 15, testY + 5)

  // ==================== PAGE 4 — EXTERIOR ====================
  doc.addPage()
  doc.setFillColor(NAVY)
  doc.rect(0, 0, W, 16, 'F')
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#ffffff')
  doc.text('Exterior Inspection', 15, 11)

  let extY = 25
  const extConditions = [
    { label: 'Overall', value: exterior_data.overallCondition },
    { label: 'Paint', value: exterior_data.paintCondition },
    { label: 'Glass', value: exterior_data.glassCondition },
  ]
  extConditions.forEach(c => {
    if (!c.value) return
    const color = c.value === 'good' ? GREEN : c.value === 'fair' || c.value === 'faded' || c.value === 'chipped' ? YELLOW : RED
    doc.setFillColor(color)
    doc.roundedRect(14, extY - 4, 50, 7, 1, 1, 'F')
    doc.setFontSize(7)
    doc.setTextColor('#ffffff')
    doc.text(`${c.label}: ${c.value}`, 39, extY, { align: 'center' })
    extY += 10
  })

  // Tires
  extY += 4
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(NAVY)
  doc.text('Tires', 15, extY)
  extY += 6

  const tirePositions = [
    { key: 'tireFrontLeft', label: 'FL', x: 15 },
    { key: 'tireFrontRight', label: 'FR', x: 60 },
    { key: 'tireRearLeft', label: 'RL', x: 115 },
    { key: 'tireRearRight', label: 'RR', x: 160 },
  ]

  tirePositions.forEach(({ key, label, x }) => {
    const tire = exterior_data[key] ?? {}
    doc.setFillColor(LIGHT_GRAY)
    doc.roundedRect(x, extY - 4, 42, 20, 2, 2, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(NAVY)
    doc.text(label, x + 21, extY + 2, { align: 'center' })
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(DARK_GRAY)
    doc.text(`Tread: ${tire.treadDepth ?? 'N/A'}/32"`, x + 21, extY + 8, { align: 'center' })
    if (tire.flat) { doc.setTextColor(RED); doc.text('FLAT', x + 21, extY + 14, { align: 'center' }) }
  })
  extY += 28

  // Damage table
  const damages = [...(exterior_data.damages ?? []), ...(interior_data.damages ?? [])]
  if (damages.length > 0) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(NAVY)
    doc.text('Damage Report', 15, extY)
    extY += 6

    const headers = ['#', 'Type', 'Location', 'Severity', 'Impact']
    const colWidths = [10, 40, 45, 35, 35]
    let cx = 15
    headers.forEach((h, i) => {
      doc.setFillColor(NAVY)
      doc.rect(cx, extY - 4, colWidths[i], 7, 'F')
      doc.setFontSize(7)
      doc.setTextColor('#ffffff')
      doc.text(h, cx + colWidths[i] / 2, extY, { align: 'center' })
      cx += colWidths[i]
    })
    extY += 7

    damages.slice(0, 8).forEach((dmg: any, i: number) => {
      const row = [
        String(i + 1),
        dmg.type ?? '',
        dmg.location ?? '',
        dmg.severity ?? '',
        dmg.estimatedImpact ?? '',
      ]
      cx = 15
      row.forEach((cell, ci) => {
        if (i % 2 === 0) { doc.setFillColor(LIGHT_GRAY); doc.rect(cx, extY - 4, colWidths[ci], 6, 'F') }
        doc.setFontSize(6.5)
        doc.setTextColor(DARK_GRAY)
        doc.text(cell, cx + 2, extY)
        cx += colWidths[ci]
      })
      extY += 6
    })
  }

  // ==================== PAGE 5 — INTERIOR ====================
  doc.addPage()
  doc.setFillColor(NAVY)
  doc.rect(0, 0, W, 16, 'F')
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#ffffff')
  doc.text('Interior Inspection', 15, 11)

  let intY = 25
  const intConditions = [
    { label: 'Overall', value: interior_data.overallCondition },
    { label: 'Front Seats', value: interior_data.frontSeats },
    { label: 'Rear Seats', value: interior_data.rearSeats },
    { label: 'Dashboard', value: interior_data.dashboard },
    { label: 'Headliner', value: interior_data.headliner },
    { label: 'Carpet/Floor', value: interior_data.carpetFloor },
    { label: 'Steering Wheel', value: interior_data.steeringWheel },
  ]

  let colIdx = 0
  intConditions.forEach(c => {
    if (!c.value) return
    const color = c.value === 'good' ? GREEN : c.value === 'fair' || c.value === 'faded' ? YELLOW : RED
    const x = 15 + (colIdx % 3) * 64
    doc.setFillColor(color)
    doc.roundedRect(x, intY - 4, 60, 10, 1, 1, 'F')
    doc.setFontSize(7)
    doc.setTextColor('#ffffff')
    doc.setFont('helvetica', 'bold')
    doc.text(c.label, x + 30, intY - 0.5, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.text(c.value, x + 30, intY + 4, { align: 'center' })
    colIdx++
    if (colIdx % 3 === 0) intY += 13
  })
  if (colIdx % 3 !== 0) intY += 13
  intY += 4

  if (interior_data.interiorOdor) {
    doc.setFillColor('#fef3c7')
    doc.roundedRect(15, intY, W - 30, 12, 2, 2, 'F')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(YELLOW)
    doc.text(`Odor Present: ${interior_data.odorType ?? 'unknown'}`, 20, intY + 8)
    intY += 16
  }

  // ==================== PAGE 6 — ENGINE ====================
  doc.addPage()
  doc.setFillColor(NAVY)
  doc.rect(0, 0, W, 16, 'F')
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#ffffff')
  doc.text('Engine Compartment', 15, 11)

  let engY = 25
  const fluids = [
    { label: 'Oil Level', value: engine_data.oilLevel },
    { label: 'Coolant', value: engine_data.coolantLevel },
    { label: 'Brake Fluid', value: engine_data.brakeFluid },
    { label: 'Trans Fluid', value: engine_data.transmissionFluid },
  ]

  fluids.forEach(f => {
    if (!f.value) return
    const good = f.value === 'full' || f.value === 'good'
    const color = good ? GREEN : f.value === 'low' ? RED : YELLOW
    doc.setFillColor(color)
    doc.roundedRect(14, engY - 4, 50, 7, 1, 1, 'F')
    doc.setFontSize(7)
    doc.setTextColor('#ffffff')
    doc.text(`${f.label}: ${f.value}`, 39, engY, { align: 'center' })
    engY += 10
  })

  const components = [
    { label: 'Battery', value: engine_data.batteryCondition },
    { label: 'Belts', value: engine_data.beltCondition },
    { label: 'Hoses', value: engine_data.hoseCondition },
  ]
  components.forEach(c => {
    if (!c.value) return
    const color = c.value === 'good' ? GREEN : c.value === 'fair' || c.value === 'worn' ? YELLOW : RED
    doc.setFillColor(color)
    doc.roundedRect(14, engY - 4, 50, 7, 1, 1, 'F')
    doc.setFontSize(7)
    doc.setTextColor('#ffffff')
    doc.text(`${c.label}: ${c.value}`, 39, engY, { align: 'center' })
    engY += 10
  })

  if (engine_data.visibleLeaks) {
    engY += 4
    doc.setFillColor('#fee2e2')
    doc.roundedRect(15, engY, W - 30, 14, 2, 2, 'F')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(RED)
    doc.text('Visible Leaks Detected', 20, engY + 6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(DARK_GRAY)
    doc.text(engine_data.leakDescription ?? '', 20, engY + 11)
    engY += 18
  }

  if (engine_data.unusualNoise) {
    doc.setFillColor('#fff7ed')
    doc.roundedRect(15, engY, W - 30, 14, 2, 2, 'F')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(ORANGE)
    doc.text('Unusual Noise Detected', 20, engY + 6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(DARK_GRAY)
    doc.text(`Type: ${engine_data.noiseType ?? 'unknown'}`, 20, engY + 11)
    engY += 18
  }

  // ==================== PAGE 7 — CERTIFICATION ====================
  doc.addPage()
  doc.setFillColor(NAVY)
  doc.rect(0, 0, W, 16, 'F')
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#ffffff')
  doc.text('Certification', 15, 11)

  let certY = 28
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(NAVY)
  doc.text('Inspector Signature', 15, certY)
  certY += 4

  if (signatureUrl) {
    try {
      doc.addImage(signatureUrl, 'PNG', 15, certY, 80, 30)
    } catch { /* signature not embeddable */ }
    certY += 35
  }

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(MID_GRAY)
  doc.text(
    'I certify that this vehicle inspection was conducted accurately and completely to the best of my knowledge.',
    15, certY, { maxWidth: W - 30 }
  )
  certY += 12

  if (inspectionData.gpsStart) {
    doc.setFontSize(8)
    doc.setTextColor(DARK_GRAY)
    const gps = inspectionData.gpsStart
    doc.text(`GPS (Start): ${gps.lat?.toFixed(5) ?? 'N/A'}, ${gps.lng?.toFixed(5) ?? 'N/A'}   Accuracy: ±${gps.accuracy?.toFixed(0) ?? 'N/A'}m`, 15, certY)
    certY += 8
  }

  doc.setFontSize(7)
  doc.setTextColor('#9ca3af')
  doc.text(
    'This report was generated by Condition IQ. All data is based on physical inspection conducted at the time noted above. Condition IQ is not liable for undisclosed pre-existing conditions.',
    15, certY, { maxWidth: W - 30 }
  )

  // Open PDF in new tab
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}
