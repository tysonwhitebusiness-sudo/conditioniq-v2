// R1 · Report foundation.
//
// Reports are rendered on the server (app/api/reports). This is what the screens
// call: ask for an inspection's report, then open the link that comes back.
// Nothing about the report is built in the browser any more — no fonts, no
// photos and no PDF library in the page's download.

import { GRAY_700 } from './design-tokens'

export interface ReportResult {
  path: string
  url: string | null
  bytes: number
}

/**
 * Builds the report for an inspection and opens it.
 * Returns the stored path, or null when it could not be generated.
 */
export async function generateReport(inspectionId: string, options: { open?: boolean } = {}): Promise<string | null> {
  const { open = true } = options
  if (!inspectionId) return null

  const response = await fetch('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionId }),
  })

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    throw new Error(detail?.error ?? `Report generation failed (${response.status})`)
  }

  const result: ReportResult = await response.json()
  if (open && result.url) window.open(result.url, '_blank')
  return result.path ?? null
}

/**
 * R5 · Opens an inspection's report, building it first when there is none yet,
 * when it was drawn with an earlier layout, or when asked to rebuild.
 *
 * The tab opens straight away, while the tap still counts as a tap: phone
 * browsers block a tab opened after the few seconds a report takes to build.
 */
export async function openReport(
  inspection: { id: string; report_url?: string | null },
  options: { rebuild?: boolean } = {},
): Promise<void> {
  const tab = window.open('', '_blank')
  if (tab) {
    tab.document.title = 'Condition report'
    tab.document.body.style.cssText = 'font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:' + GRAY_700
    tab.document.body.textContent = 'Preparing the report…'
  }
  const show = (url: string) => { if (tab) tab.location.href = url; else window.open(url, '_blank') }

  try {
    const { isCurrentReport } = await import('./report/layout')
    const stored = inspection.report_url ?? null
    if (!options.rebuild && stored && isCurrentReport(inspection.id, stored)) {
      const { getReportSignedUrlAction } = await import('./inspection-server-actions')
      const url = await getReportSignedUrlAction(stored)
      if (url) { show(url); return }
    }
    const response = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionId: inspection.id }),
    })
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}))
      throw new Error(detail?.error ?? `Report generation failed (${response.status})`)
    }
    const result: ReportResult = await response.json()
    if (!result.url) throw new Error('The report was built but could not be opened')
    show(result.url)
  } catch (e) {
    tab?.close()
    throw e
  }
}

/**
 * Kept for the screens that still pass a whole inspection object. Only the id
 * is used; everything else the report needs is read on the server.
 */
export async function generateInspectionPDF(
  inspectionData: Record<string, any>,
  _score?: unknown,
  _signature?: unknown,
): Promise<string | null> {
  const id = (inspectionData?.inspectionId ?? inspectionData?.id) as string | undefined
  if (!id) throw new Error('Cannot generate a report without an inspection id')
  return generateReport(id)
}
