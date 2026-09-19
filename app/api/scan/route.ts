import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeInspectionAccess } from '@/lib/inspection-auth'
import { prepareImage, readText } from '@/lib/scan/reader'
import { pickPlate, fitStateFormat, looksLikePlate } from '@/lib/scan/plate'
import { extractVin, nhtsaDecodes } from '@/lib/scan/vin'
import { readWithAi } from '@/lib/scan/ai-fallback'

// S · Reads a VIN or plate from a photo.
//
//   POST { kind: 'vin' | 'plate', image, state?, inspectionId? }
//     → { id, value, source }   value is null when nothing could be read
//   PUT  { id, savedValue }     records what the inspector kept
//
// The barcode is read on the phone before this is ever called. Here the text
// reader runs first; the AI fallback runs only when it finds nothing that
// passes the checks. A VIN must pass its check digit and decode at NHTSA; a
// plate must fit a plate format. Nothing is saved to the inspection here: the
// inspector confirms every read.

/** AI reads per account per hour for scans outside an inspection. */
const SCAN_AI_PER_HOUR = 60

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const PHOTO_BUCKET = 'inspection-photos'
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

async function loadImage(image: string): Promise<{ buffer: Buffer; path: string | null } | null> {
  const dataUrl = image.match(/^data:image\/[a-z+]+;base64,(.+)$/)
  if (dataUrl) {
    const buffer = Buffer.from(dataUrl[1], 'base64')
    return buffer.length <= MAX_IMAGE_BYTES ? { buffer, path: null } : null
  }
  // Only our own storage: a scan never fetches an address a client names.
  const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host
  let url: URL
  try { url = new URL(image) } catch { return null }
  if (url.protocol !== 'https:' || url.host !== host) return null
  const path = decodeURIComponent(url.pathname.split(`/${PHOTO_BUCKET}/`)[1] ?? '')
  if (!path) return null
  const { data } = await createAdminClient().storage.from(PHOTO_BUCKET).download(path)
  if (!data) return null
  const buffer = Buffer.from(await data.arrayBuffer())
  return buffer.length <= MAX_IMAGE_BYTES ? { buffer, path } : null
}

async function validVin(value: string | null): Promise<string | null> {
  const vin = value ? extractVin(value) : null
  return vin && (await nhtsaDecodes(vin)) ? vin : null
}

function validPlate(value: string | null, state: string | null): string | null {
  if (!value) return null
  const plate = fitStateFormat(value, state) ?? value
  return looksLikePlate(plate) ? plate : null
}

export async function POST(request: Request) {
  const started = Date.now()
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to scan' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Expected JSON' }, { status: 400 }) }
  const kind = body?.kind === 'vin' || body?.kind === 'plate' ? body.kind as 'vin' | 'plate' : null
  const state = typeof body?.state === 'string' && /^[A-Z]{2}$/i.test(body.state) ? body.state.toUpperCase() : null
  const inspectionId = typeof body?.inspectionId === 'string' ? body.inspectionId : null
  if (!kind || typeof body?.image !== 'string') return NextResponse.json({ error: 'Expected { kind, image }' }, { status: 400 })

  const admin = createAdminClient()
  let companyId: string | null = null
  // The AI fallback costs money. Inside an inspection it is held to that
  // inspection's ceiling. Outside one (the scan before an inspection starts) it
  // is only for staff of an account, and at most SCAN_AI_PER_HOUR reads an hour
  // per account: an anonymous session, which anyone can open, gets the free
  // on-device reader only.
  let aiAllowed = true
  if (inspectionId) {
    const auth = await authorizeInspectionAccess(inspectionId)
    if (!auth.ok) return NextResponse.json({ error: 'Not authorized for this inspection' }, { status: 403 })
    companyId = auth.companyId
  } else {
    const { data: profile } = await admin.from('user_profiles').select('company_id').eq('id', user.id).maybeSingle()
    companyId = user.is_anonymous ? null : profile?.company_id ?? null
    if (!companyId) aiAllowed = false
    else {
      const { count } = await admin.from('ai_calls').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('feature', 'scan').is('inspection_id', null)
        .gte('created_at', new Date(Date.now() - 3600_000).toISOString())
      if ((count ?? 0) >= SCAN_AI_PER_HOUR) aiAllowed = false
    }
  }

  const loaded = await loadImage(body.image)
  if (!loaded) return NextResponse.json({ error: 'Could not open that photo' }, { status: 400 })

  let value: string | null = null
  let source: 'reader' | 'ai' | null = null
  let confidence: number | null = null
  const image = await prepareImage(loaded.buffer)

  try {
    const lines = await readText(image)
    if (kind === 'plate') {
      const read = pickPlate(lines, state)
      value = validPlate(read?.plate ?? null, state)
      confidence = read?.confidence ?? null
    } else {
      // A VIN plate often splits across two lines, so the lines are tried alone and joined.
      value = await validVin(lines.map(l => l.text).join('\n')) ?? await validVin(lines.map(l => l.text).join(''))
      confidence = value ? Math.min(...lines.filter(l => l.text.length > 3).map(l => l.confidence)) : null
    }
    if (value) source = 'reader'
  } catch (e) {
    console.error('[scan] reader failed', e)
  }

  if (!value && aiAllowed) {
    const aiRead = await readWithAi({ kind, imageJpeg: await prepareImage(loaded.buffer, 1568), state, companyId, inspectionId })
    value = kind === 'vin' ? await validVin(aiRead) : validPlate(aiRead, state)
    if (value) { source = 'ai'; confidence = null }
  }

  // Keep the photo with the read. Photos already in storage are referenced, not copied.
  let photoPath = loaded.path
  if (!photoPath) {
    const path = `scans/${companyId ?? 'none'}/${randomUUID()}.jpg`
    const { error } = await admin.storage.from(PHOTO_BUCKET).upload(path, image, { contentType: 'image/jpeg' })
    if (!error) photoPath = path
  }

  const { data: row } = await admin.from('scan_reads').insert({
    company_id: companyId,
    inspection_id: inspectionId,
    user_id: user.id,
    kind,
    source,
    read_value: value,
    confidence: confidence == null ? null : Math.round(confidence * 1000) / 1000,
    state,
    photo_path: photoPath,
    duration_ms: Date.now() - started,
  }).select('id').single()

  return NextResponse.json({ id: row?.id ?? null, value, source })
}

export async function PUT(request: Request) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in' }, { status: 401 })
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Expected JSON' }, { status: 400 }) }
  if (typeof body?.id !== 'string' || typeof body?.savedValue !== 'string') return NextResponse.json({ error: 'Expected { id, savedValue }' }, { status: 400 })
  // Only the person who scanned can record what they kept.
  const { error } = await createAdminClient().from('scan_reads')
    .update({ saved_value: body.savedValue.toUpperCase().slice(0, 32), saved_at: new Date().toISOString() })
    .eq('id', body.id).eq('user_id', user.id)
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
}
