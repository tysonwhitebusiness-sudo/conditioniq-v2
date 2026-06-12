import type { ScoreResult } from './vehicle-score'

export async function generateInspectionPDF(
  inspectionData: Record<string, any>,
  scoreResult: ScoreResult,
  signatureUrl: string
): Promise<string | null> {
  const React = (await import('react')).default
  const { pdf } = await import('@react-pdf/renderer')
  const { default: InspectionReport } = await import('./pdf-report')

  // Fetch branding info for white label (company_id may be on the inspection)
  let logoUrl: string | null = null
  let companyName: string | null = null
  const companyId = inspectionData.company_id as string | undefined
  if (companyId) {
    try {
      const { getCompanyLogo } = await import('./branding-actions')
      const branding = await getCompanyLogo(companyId)
      logoUrl = branding.logoUrl
      companyName = branding.companyName
    } catch { /* non-fatal */ }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(InspectionReport, { inspectionData, scoreResult, signatureUrl, logoUrl, companyName }) as any
  const blob = await pdf(element).toBlob()

  const inspectionId = inspectionData.inspectionId as string | undefined
  const vin = inspectionData.vehicleInfo?.vin ?? 'inspection'
  const date = new Date().toISOString().slice(0, 10)
  const downloadName = `ConditionIQ_${vin}_${date}.pdf`

  if (inspectionId) {
    try {
      const path = `${inspectionId}.pdf`

      // Get a pre-authorized upload URL from the server (admin client, bypasses storage RLS)
      const { createSignedUploadUrlAction, getReportSignedUrlAction } = await import('./inspection-server-actions')
      const uploadAuth = await createSignedUploadUrlAction(path)

      if (uploadAuth) {
        const { createClient } = await import('./supabase/client')
        const supabase = createClient()
        const { error: uploadError } = await supabase.storage
          .from('inspection-reports')
          .uploadToSignedUrl(path, uploadAuth.token, blob, { contentType: 'application/pdf' })

        if (!uploadError) {
          // Open the PDF immediately via a fresh signed view URL
          const viewUrl = await getReportSignedUrlAction(path)
          if (viewUrl) window.open(viewUrl, '_blank')
          return path
        }
        console.error('[pdf] uploadToSignedUrl error:', uploadError)
      }
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
