import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { calculateVehicleScore } from '@/lib/vehicle-score'
import { buildReportModel } from '@/lib/report/model'
import { REPORT_TIME_ZONE } from '@/lib/report/layout'
import { PRIMARY_LIGHT, GRAY_900, GRAY_700, GRAY_500, GRAY_300, GRAY_100, WHITE, SUCCESS_DARK, SUCCESS_LIGHT } from '@/lib/design-tokens'
import OpenReportButton from './open-report-button'

// R5 · The page behind a report's QR code and footer link.
//
// Anyone holding a printed or forwarded report can check it here: the page
// confirms the report is on file and shows the facts that identify it — the
// vehicle, VIN, date, who issued it and the score — so a copy that was edited
// does not match. It shows no photos, notes or findings; the full report stays
// with the company that issued it, whose own users get a button to open it.

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Verify a condition report · Condition IQ',
  robots: { index: false, follow: false },
}

const REPORT_NO = /^[0-9a-f]{8}$/i

async function findReport(reportNo: string) {
  if (!REPORT_NO.test(reportNo)) return null
  const prefix = reportNo.toLowerCase()
  const admin = createAdminClient()
  // The report number is the start of the inspection id, so the match is a
  // range on the primary key.
  const { data: rows } = await admin
    .from('vehicle_inspections')
    .select('*')
    .gte('id', `${prefix}-0000-0000-0000-000000000000`)
    .lte('id', `${prefix}-ffff-ffff-ffff-ffffffffffff`)
    .eq('status', 'completed')
    .limit(2)
  // Two completed inspections sharing a report number cannot be told apart
  // from the number alone, so neither is confirmed.
  if (!rows || rows.length !== 1) return null
  const inspection = rows[0]

  const { data: company } = inspection.company_id
    ? await admin.from('companies').select('name').eq('id', inspection.company_id).maybeSingle()
    : { data: null }
  return { inspection, companyName: (company?.name as string | undefined) ?? null }
}

async function viewerBelongsTo(companyId: string | null): Promise<boolean> {
  if (!companyId) return false
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return false
  const { data: profile } = await session.from('user_profiles').select('company_id').eq('id', user.id).maybeSingle()
  return profile?.company_id === companyId
}

const fmt = (d: Date) =>
  d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: REPORT_TIME_ZONE, timeZoneName: 'short' })

export default async function VerifyReportPage({ params }: { params: { reportNo: string } }) {
  const found = await findReport(params.reportNo)
  if (!found) notFound()
  const { inspection, companyName } = found

  const score = calculateVehicleScore(inspection)
  const model = buildReportModel(inspection, score, [], { companyName })
  const canOpen = await viewerBelongsTo(inspection.company_id)
  const facts: Array<[string, string]> = [
    ['Vehicle', model.title],
    ['VIN', model.vin],
    ['Odometer', model.odometer && !isNaN(Number(model.odometer)) ? `${Number(model.odometer).toLocaleString('en-US')} mi` : '—'],
    ['Inspected', fmt(model.date)],
    ...(model.signedAt ? [['Signed', fmt(model.signedAt)] as [string, string]] : []),
    ['Issued by', companyName ?? '—'],
    ['Score', `${score.score} · Grade ${score.grade}`],
  ]

  return (
    <main style={{ minHeight: '100vh', background: GRAY_100, display: 'flex', justifyContent: 'center', padding: '40px 16px' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: GRAY_900, margin: '0 0 16px' }}>Condition IQ</p>
        <div style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: SUCCESS_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ShieldCheck size={20} color={SUCCESS_DARK} />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: GRAY_900, margin: 0 }}>Report on file</h1>
              <p style={{ fontSize: 13, color: GRAY_500, margin: '2px 0 0' }}>{`Report ${model.reportNo}`}</p>
            </div>
          </div>
          <p style={{ fontSize: 14, color: GRAY_700, lineHeight: 1.5, margin: '14px 0 16px' }}>
            This condition report was issued through Condition IQ. Check that the details below match the copy you have.
          </p>
          <dl style={{ margin: 0 }}>
            {facts.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderTop: `1px solid ${GRAY_300}` }}>
                <dt style={{ fontSize: 13, color: GRAY_500 }}>{k}</dt>
                <dd style={{ fontSize: 13, fontWeight: 600, color: GRAY_900, margin: 0, textAlign: 'right', wordBreak: 'break-word' }}>{v}</dd>
              </div>
            ))}
          </dl>
          {canOpen ? (
            <OpenReportButton inspectionId={inspection.id} reportUrl={inspection.report_url ?? null} />
          ) : (
            <p style={{ fontSize: 12, color: GRAY_500, background: PRIMARY_LIGHT, borderRadius: 10, padding: '10px 12px', margin: '16px 0 0', lineHeight: 1.5 }}>
              {`Photos and findings are in the full report, which ${companyName ?? 'the issuing company'} holds.`}
            </p>
          )}
        </div>
        <p style={{ fontSize: 12, color: GRAY_500, textAlign: 'center', margin: '16px 0 0' }}>
          If these details do not match your copy, the copy has been changed since it was issued.
        </p>
      </div>
    </main>
  )
}
