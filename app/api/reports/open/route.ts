import { NextResponse } from 'next/server'
import { authorizeInspectionAccess } from '@/lib/inspection-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateAndStoreReport } from '@/lib/report/render'
import { isCurrentReport } from '@/lib/report/layout'
import { GRAY_100, GRAY_300, GRAY_700, GRAY_900, PRIMARY } from '@/lib/design-tokens'

// Opens an inspection's report in the tab that requested it.
//
//   GET /api/reports/open?inspectionId=…[&rebuild=1]
//
// The app opens this in a new tab straight from the tap. Before, the app opened
// a blank tab and then filled it in once the report was ready, but a phone puts
// the app's own tab to sleep as soon as the new tab takes focus, so the blank
// tab was never filled. Here the new tab does its own waiting: the first
// response is a small "Preparing the report…" page that reloads itself with
// go=1, and the browser keeps showing it while the report is found or built,
// then follows the redirect to the PDF.

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const escape = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

function page(title: string, body: string, status = 200, refreshTo?: string) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>${refreshTo ? `<meta http-equiv="refresh" content="0;url=${escape(refreshTo)}">` : ''}
<style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:${GRAY_100};color:${GRAY_900}}
main{max-width:340px;padding:24px;text-align:center}p{color:${GRAY_700};font-size:15px;line-height:1.5;margin:8px 0 0}h1{font-size:18px;margin:0}
.spin{width:28px;height:28px;margin:0 auto 16px;border:3px solid ${GRAY_300};border-top-color:${PRIMARY};border-radius:50%;animation:s .8s linear infinite}@keyframes s{to{transform:rotate(360deg)}}</style>
</head><body><main>${body}</main></body></html>`
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

function failure(message: string, status: number) {
  return page('Report not available', `<h1>The report could not be opened</h1><p>${escape(message)}</p><p>Close this tab and try again from the app.</p>`, status)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const inspectionId = url.searchParams.get('inspectionId') ?? ''
  if (!UUID.test(inspectionId)) return failure('This link is missing the inspection.', 400)

  // A rebuild costs a render (and possibly a summary); only this site may ask for one.
  const site = request.headers.get('sec-fetch-site')
  const rebuild = url.searchParams.get('rebuild') === '1' && (!site || site === 'same-origin' || site === 'none')

  if (url.searchParams.get('go') !== '1') {
    const next = new URL(url)
    next.searchParams.set('go', '1')
    if (!rebuild) next.searchParams.delete('rebuild')
    return page('Preparing the report…', '<div class="spin"></div><h1>Preparing the report…</h1><p>This takes a few seconds.</p>', 200, next.pathname + next.search)
  }

  const { ok } = await authorizeInspectionAccess(inspectionId)
  if (!ok) return failure('You do not have access to this report. Sign in to the app and try again.', 403)

  try {
    const admin = createAdminClient()
    if (!rebuild) {
      const { data: row } = await admin.from('vehicle_inspections').select('report_url').eq('id', inspectionId).maybeSingle()
      if (row?.report_url && isCurrentReport(inspectionId, row.report_url)) {
        const { data: signed } = await admin.storage.from('inspection-reports').createSignedUrl(row.report_url, 3600)
        if (signed?.signedUrl) return NextResponse.redirect(signed.signedUrl, { status: 303, headers: { 'Cache-Control': 'no-store' } })
      }
    }
    const result = await generateAndStoreReport(inspectionId)
    if (!result.url) return failure('The report was built but could not be opened.', 500)
    return NextResponse.redirect(result.url, { status: 303, headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('[report/open] failed', e)
    return failure(e?.message ?? 'Report generation failed.', 500)
  }
}
