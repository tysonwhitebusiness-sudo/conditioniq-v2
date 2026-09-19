// R1 · Report foundation.
//
// Reports are rendered on the server (app/api/reports). This is what the screens
// call: ask for an inspection's report, then open the link that comes back.
// Nothing about the report is built in the browser any more — no fonts, no
// photos and no PDF library in the page's download.


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
 * Opens an inspection's report in a new tab: the stored one when it is drawn
 * with the current layout, otherwise built on the server first; rebuild asks
 * for a fresh one.
 *
 * The tab opens straight away at /api/reports/open, which does its own
 * waiting and then redirects to the PDF. The app no longer fills in a blank
 * tab after the report is ready: phones pause the app's tab as soon as the new
 * one takes focus, which left that blank tab empty. If the browser blocks the
 * new tab, the report opens in this one.
 */
export async function openReport(
  inspection: { id: string; report_url?: string | null },
  options: { rebuild?: boolean } = {},
): Promise<void> {
  const url = `/api/reports/open?inspectionId=${encodeURIComponent(inspection.id)}${options.rebuild ? '&rebuild=1' : ''}`
  const tab = window.open(url, '_blank')
  if (!tab) window.location.href = url
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
