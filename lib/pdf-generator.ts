import type { ScoreResult } from './vehicle-score'
import type { ReportDamagePin } from './damage-server-actions'
import type { ReportDamageViewWithSize } from './pdf-report'

// Pins placed on the damage diagram, and each 2D view's proportions so pins can
// be drawn at their exact spot. A report without pins, or one the viewer cannot
// load them for (e.g. a shared link), renders without the damage map.
async function loadDamageMap(inspectionData: Record<string, any>): Promise<{ damagePins: ReportDamagePin[]; damageViews: ReportDamageViewWithSize[] }> {
  const id = (inspectionData.inspectionId ?? inspectionData.id) as string | undefined
  if (!id) return { damagePins: [], damageViews: [] }
  try {
    const { getInspectionReportDamage } = await import('./damage-server-actions')
    const { pins, views } = await getInspectionReportDamage(id)
    const damageViews = await Promise.all(views.map(v => new Promise<ReportDamageViewWithSize>(resolve => {
      const image = new window.Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => resolve({ ...v, aspect: image.naturalWidth ? image.naturalHeight / image.naturalWidth : 0.6 })
      image.onerror = () => resolve({ ...v, aspect: 0.6 })
      image.src = v.imageUrl
    })))
    return { damagePins: pins, damageViews }
  } catch (e) {
    console.error('[pdf] damage map unavailable', e)
    return { damagePins: [], damageViews: [] }
  }
}

export async function generateInspectionPDF(
  inspectionData: Record<string, any>,
  scoreResult: ScoreResult,
  signatureUrl: string
): Promise<string | null> {
  const inspStatus = inspectionData.status as string | undefined
  if (inspStatus && !['completed', 'submitted'].includes(inspStatus)) {
    throw new Error(`PDF generation refused: inspection status is "${inspStatus}". Only completed inspections can generate reports.`)
  }

  const React = (await import('react')).default
  const { pdf } = await import('@react-pdf/renderer')
  const { default: InspectionReport } = await import('./pdf-report')

  // Fetch branding info for white label (company_id may be on the inspection)
  let logoUrl: string | null = null
  let companyName: string | null = null
  let brandHeaderColor: string | null = null
  let brandAccentColor: string | null = null
  const companyId = inspectionData.company_id as string | undefined
  if (companyId) {
    try {
      const { getCompanyLogo } = await import('./branding-actions')
      const branding = await getCompanyLogo(companyId)
      logoUrl = branding.logoUrl
      companyName = branding.companyName
      brandHeaderColor = branding.brandHeaderColor
      brandAccentColor = branding.brandAccentColor
    } catch { /* non-fatal */ }
  }

  const { damagePins, damageViews } = await loadDamageMap(inspectionData)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(InspectionReport, { inspectionData, scoreResult, signatureUrl, logoUrl, companyName, brandHeaderColor, brandAccentColor, damagePins, damageViews }) as any
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
