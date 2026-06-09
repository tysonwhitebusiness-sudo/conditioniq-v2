export interface QualityIssue {
  type: 'blocking' | 'warning'
  message: string
}

export function getQualityIssues(inspectionData: Record<string, any>): QualityIssue[] {
  const issues: QualityIssue[] = []
  const ext = inspectionData.exterior_data ?? {}
  const int = inspectionData.interior_data ?? {}
  const eng = inspectionData.engine_data ?? {}
  const func = inspectionData.vehicle_function_data ?? {}

  // Blocking issues
  const extPhotos = ['exteriorFrontPhoto', 'exteriorRearPhoto', 'exteriorDriverPhoto', 'exteriorPassengerPhoto']
  const capturedPhotos = extPhotos.filter(k => ext[k]).length
  if (capturedPhotos < 2) {
    issues.push({ type: 'blocking', message: 'At least 2 exterior photos required' })
  }

  if (!eng.engineBayPhoto) {
    issues.push({ type: 'blocking', message: 'Engine bay photo required' })
  }

  const tests = func.tests ?? {}
  const filledTests = Object.values(tests).filter(v => v !== undefined && v !== null).length
  if (filledTests < 8) {
    issues.push({ type: 'blocking', message: `At least 8 function checks required (${filledTests}/8 filled)` })
  }

  if (!ext.overallCondition) {
    issues.push({ type: 'blocking', message: 'Overall exterior condition must be set' })
  }

  if (!int.overallCondition) {
    issues.push({ type: 'blocking', message: 'Overall interior condition must be set' })
  }

  if (!eng.oilLevel) {
    issues.push({ type: 'blocking', message: 'Oil level must be checked' })
  }

  // Warnings
  if (capturedPhotos < 4 && capturedPhotos >= 2) {
    issues.push({ type: 'warning', message: `Only ${capturedPhotos}/4 exterior photos captured` })
  }

  return issues
}

export function hasBlockingIssues(inspectionData: Record<string, any>, isOwner: boolean): boolean {
  if (isOwner) return false
  return getQualityIssues(inspectionData).some(i => i.type === 'blocking')
}
