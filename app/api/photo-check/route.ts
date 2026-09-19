import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeInspectionAccess } from '@/lib/inspection-auth'
import { runAi } from '@/lib/ai/client'
import { photoCheckRequest, photoCheckSchema, parsePhotoCheck, photoCheckModel, PHOTO_CHECK_VERSION, SLOT_SUBJECT } from '@/lib/ai/photo-check'
import { GAUGE_SLOTS, parseGauges, compareOdometer, type GaugeReading, type OdometerStatus } from '@/lib/ai/gauges'
import type { QualityProblem } from '@/lib/photo-quality'

// D · The photo check behind the camera's confirm screen.
//
//   POST { inspectionId, slot, image, sharpness, brightness, problems }
//     → { rightSubject, framed, note } (nulls when the AI check was skipped)
//
// The phone has already measured blur and brightness (free); those numbers
// are stored as sent. The AI check (right slot, framed) runs through runAi,
// so the account switch, kill switch and spend ceiling apply, and a skipped
// check simply returns nulls. The result replaces the slot's previous check,
// so the report describes the photo that was kept. Never blocks anything.

export const maxDuration = 30
export const dynamic = 'force-dynamic'

const PROBLEMS: QualityProblem[] = ['blurry', 'dark', 'bright']

export async function POST(request: Request) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Expected JSON' }, { status: 400 }) }
  const { inspectionId, slot, image } = body ?? {}
  if (typeof inspectionId !== 'string' || typeof slot !== 'string' || typeof image !== 'string') {
    return NextResponse.json({ error: 'Expected { inspectionId, slot, image }' }, { status: 400 })
  }
  const auth = await authorizeInspectionAccess(inspectionId)
  if (!auth.ok) return NextResponse.json({ error: 'Not authorized for this inspection' }, { status: 403 })

  const problems = (Array.isArray(body.problems) ? body.problems : []).filter((p: unknown): p is QualityProblem => PROBLEMS.includes(p as QualityProblem))
  const base64 = image.match(/^data:image\/jpeg;base64,(.+)$/)?.[1]
  // The phone sends a 512 px copy, or 1280 px for the dashboard and odometer so
  // the digits can be read; anything much bigger is refused.
  const gaugeSlot = GAUGE_SLOTS.has(slot)
  const maxLength = gaugeSlot ? 1_500_000 : 400_000
  const aiRequest = base64 && base64.length < maxLength && SLOT_SUBJECT[slot] ? photoCheckRequest(slot, base64) : null

  let check: { rightSubject: boolean; framed: boolean; note: string } | null = null
  let gauges: GaugeReading | null = null
  let odometerStatus: OdometerStatus | null = null
  if (aiRequest) {
    const result = await runAi({
      feature: 'photo_check',
      promptVersion: PHOTO_CHECK_VERSION,
      model: photoCheckModel(slot),
      companyId: auth.companyId,
      inspectionId,
      ...aiRequest,
      maxTokens: gaugeSlot ? 200 : 150,
      thinking: 'off',
      jsonSchema: photoCheckSchema(slot),
    })
    if (result.ok) {
      const text = result.message.content.map(b => (b.type === 'text' ? b.text : '')).join('')
      check = parsePhotoCheck(text)
      if (gaugeSlot) {
        // E · Read the gauges and check the odometer against the typed reading.
        let answer: unknown = null
        try { answer = JSON.parse(text) } catch { /* no reading */ }
        gauges = parseGauges(answer)
        const { data: row } = await createAdminClient().from('vehicle_inspections').select('odometer').eq('id', inspectionId).maybeSingle()
        const typed = row?.odometer != null && Number(row.odometer) > 0 ? Number(row.odometer) : null
        odometerStatus = compareOdometer(gauges, typed)
        if (odometerStatus === 'mismatch' && check) {
          check = { ...check, note: `The odometer reads ${gauges.odometer!.toLocaleString('en-US')} ${gauges.unit ?? 'mi'}, but ${typed!.toLocaleString('en-US')} mi was entered.` }
        }
      }
    }
  }
  const concern = !!check && (!check.rightSubject || !check.framed || odometerStatus === 'mismatch')

  const { error } = await createAdminClient().from('photo_checks').upsert({
    inspection_id: inspectionId,
    slot,
    checked_at: new Date().toISOString(),
    sharpness: Number.isFinite(body.sharpness) ? Math.round(body.sharpness) : null,
    brightness: Number.isFinite(body.brightness) ? Math.round(body.brightness) : null,
    problems,
    right_subject: check?.rightSubject ?? null,
    framed: check?.framed ?? null,
    note: concern ? check!.note || null : null,
    odometer_read: gauges?.odometer ?? null,
    odometer_unit: gauges?.unit ?? null,
    odometer_status: odometerStatus,
    fuel_level: gauges?.fuel ?? null,
  })
  if (error) console.error('[photo-check] could not store', error.message)

  return NextResponse.json({
    rightSubject: check?.rightSubject ?? null,
    framed: check?.framed ?? null,
    note: concern ? check!.note : null,
  })
}
