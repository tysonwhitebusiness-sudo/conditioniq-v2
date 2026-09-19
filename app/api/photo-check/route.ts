import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeInspectionAccess } from '@/lib/inspection-auth'
import { runAi } from '@/lib/ai/client'
import { photoCheckRequest, parsePhotoCheck, PHOTO_CHECK_MODEL, PHOTO_CHECK_SCHEMA, PHOTO_CHECK_VERSION, SLOT_SUBJECT } from '@/lib/ai/photo-check'
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
  // The phone sends a 512 px copy; anything much bigger is refused.
  const aiRequest = base64 && base64.length < 400_000 && SLOT_SUBJECT[slot] ? photoCheckRequest(slot, base64) : null

  let check: { rightSubject: boolean; framed: boolean; note: string } | null = null
  if (aiRequest) {
    const result = await runAi({
      feature: 'photo_check',
      promptVersion: PHOTO_CHECK_VERSION,
      model: PHOTO_CHECK_MODEL,
      companyId: auth.companyId,
      inspectionId,
      ...aiRequest,
      maxTokens: 150,
      thinking: 'off',
      jsonSchema: PHOTO_CHECK_SCHEMA,
    })
    if (result.ok) check = parsePhotoCheck(result.message.content.map(b => (b.type === 'text' ? b.text : '')).join(''))
  }

  const { error } = await createAdminClient().from('photo_checks').upsert({
    inspection_id: inspectionId,
    slot,
    checked_at: new Date().toISOString(),
    sharpness: Number.isFinite(body.sharpness) ? Math.round(body.sharpness) : null,
    brightness: Number.isFinite(body.brightness) ? Math.round(body.brightness) : null,
    problems,
    right_subject: check?.rightSubject ?? null,
    framed: check?.framed ?? null,
    note: check && (!check.rightSubject || !check.framed) ? check.note || null : null,
  })
  if (error) console.error('[photo-check] could not store', error.message)

  return NextResponse.json({
    rightSubject: check?.rightSubject ?? null,
    framed: check?.framed ?? null,
    note: check && (!check.rightSubject || !check.framed) ? check.note : null,
  })
}
