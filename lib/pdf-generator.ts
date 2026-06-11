import type { ScoreResult } from './vehicle-score'

export async function generateInspectionPDF(
  inspectionData: Record<string, any>,
  scoreResult: ScoreResult,
  signatureUrl: string
): Promise<string | null> {
  const React = (await import('react')).default
  const { pdf } = await import('@react-pdf/renderer')
  const { default: InspectionReport } = await import('./pdf-report')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(InspectionReport, { inspectionData, scoreResult, signatureUrl }) as any
  const blob = await pdf(element).toBlob()

  const inspectionId = inspectionData.inspectionId as string | undefined
  const vin = inspectionData.vehicleInfo?.vin ?? 'inspection'
  const date = new Date().toISOString().slice(0, 10)
  const downloadName = `ConditionIQ_${vin}_${date}.pdf`

  // Upload to Supabase storage so the URL can be saved and retrieved later
  if (inspectionId) {
    try {
      const { createClient } = await import('./supabase/client')
      const supabase = createClient()
      const path = `${inspectionId}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('inspection-reports')
        .upload(path, blob, { contentType: 'application/pdf', upsert: true })

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from('inspection-reports')
          .getPublicUrl(path)
        // Open the stored PDF in a new tab
        window.open(publicUrl, '_blank')
        return publicUrl
      }
      console.error('[pdf] upload error:', uploadError)
    } catch (e) {
      console.error('[pdf] storage upload failed:', e)
    }
  }

  // Fallback: download locally if storage upload failed
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = downloadName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return null
}
