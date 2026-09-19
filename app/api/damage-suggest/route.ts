import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { authorizeInspectionAccess } from '@/lib/inspection-auth'
import { suggestDamageForSlot } from '@/lib/ai/damage-suggest-server'
import { compareWithCheckin } from '@/lib/ai/checkin-compare-server'
import { EXTERIOR_SLOTS, type ExteriorSlot } from '@/lib/ai/damage-suggest'

// F · Check a just-uploaded exterior photo for damage.
//
//   POST { inspectionId, slot } → { ok, found, compare } or { ok: false, reason }
//
// Runs behind the camera after the upload finishes; the inspector keeps going.
// A skipped check (account off, ceiling, kill switch) returns ok: false and
// the inspection carries on exactly as it would without AI.
//
// G · On a check-out, the photo is first compared with the same photo from the
// vehicle's check-in. It goes first so that, near the spending ceiling, the
// comparison is the check that runs.

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Expected JSON' }, { status: 400 }) }
  const { inspectionId, slot } = body ?? {}
  if (typeof inspectionId !== 'string' || !EXTERIOR_SLOTS.includes(slot)) {
    return NextResponse.json({ error: 'Expected { inspectionId, slot } for an exterior photo' }, { status: 400 })
  }
  const auth = await authorizeInspectionAccess(inspectionId)
  if (!auth.ok || !auth.companyId) return NextResponse.json({ error: 'Not authorized for this inspection' }, { status: 403 })

  try {
    const compare = await compareWithCheckin(inspectionId, auth.companyId, slot as ExteriorSlot)
      .catch(err => { console.error('[damage-suggest] compare', err); return null })
    const suggested = await suggestDamageForSlot(inspectionId, auth.companyId, slot as ExteriorSlot)
    return NextResponse.json({ ...suggested, compare: compare?.outcome ?? 'error' })
  } catch (err) {
    console.error('[damage-suggest]', err)
    return NextResponse.json({ ok: false, reason: 'error' })
  }
}
