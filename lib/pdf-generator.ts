import type { ScoreResult } from './vehicle-score'

export async function generateInspectionPDF(
  inspectionData: Record<string, any>,
  scoreResult: ScoreResult,
  signatureUrl: string
): Promise<void> {
  const React = (await import('react')).default
  const { pdf } = await import('@react-pdf/renderer')
  const { default: InspectionReport } = await import('./pdf-report')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(InspectionReport, { inspectionData, scoreResult, signatureUrl }) as any
  const blob = await pdf(element).toBlob()

  const vin = inspectionData.vehicleInfo?.vin ?? 'inspection'
  const date = new Date().toISOString().slice(0, 10)
  const filename = `ConditionIQ_${vin}_${date}.pdf`

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
