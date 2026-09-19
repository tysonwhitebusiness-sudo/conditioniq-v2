import sharp from 'sharp'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAi } from './client'
import {
  COMPARE_EDGE, COMPARE_MAX_TOKENS, COMPARE_MODEL, COMPARE_SCHEMA, COMPARE_THRESHOLD, COMPARE_VERSION,
  compareRequest, parseCompare, storagePathFromPhotoUrl,
} from './checkin-compare'
import { mapArea, mapType, SLOT_VIEW, type ExteriorSlot } from './damage-suggest'

if (typeof window !== 'undefined') throw new Error('lib/ai/checkin-compare-server is server-only')

// G · Compare one check-out photo with the same photo from the vehicle's
// check-in. What looks new becomes a suggestion (kind new_since_checkin) that
// the inspector adds to the diagram or dismisses as not new. Each photo's
// outcome is kept in checkin_compares so the report can say what was compared.

type Admin = ReturnType<typeof createAdminClient>

export interface CheckinRef { id: string; createdAt: string; exteriorData: Record<string, unknown> | null }

/**
 * The check-in this check-out is measured against: the check-in linked to the
 * same vehicle record, completed before this inspection, for the same VIN.
 */
export async function findCheckin(admin: Admin, inspectionId: string): Promise<CheckinRef | null> {
  const { data: me } = await admin.from('vehicle_inspections')
    .select('id, vin, company_id, vehicle_id, created_at').eq('id', inspectionId).maybeSingle()
  if (!me) return null
  const linked = me.vehicle_id
    ? await admin.from('storage_vehicles').select('checkin_inspection_id').eq('id', me.vehicle_id).maybeSingle()
    : me.vin
      ? await admin.from('storage_vehicles').select('checkin_inspection_id').eq('company_id', me.company_id).eq('vin', me.vin)
        .not('checkin_inspection_id', 'is', null).order('updated_at', { ascending: false }).limit(1).maybeSingle()
      : { data: null }
  const checkinId = linked.data?.checkin_inspection_id
  if (!checkinId || checkinId === inspectionId) return null
  const { data: checkin } = await admin.from('vehicle_inspections')
    .select('id, vin, company_id, status, created_at, exterior_data').eq('id', checkinId).maybeSingle()
  if (!checkin || checkin.status !== 'completed' || checkin.company_id !== me.company_id) return null
  if (checkin.created_at >= me.created_at) return null
  if (me.vin && checkin.vin && me.vin !== checkin.vin) return null
  return { id: checkin.id, createdAt: checkin.created_at, exteriorData: checkin.exterior_data }
}

/**
 * Where the check-in's photo for a slot is stored. Photo links on an inspection
 * are written by the phone, so a link is only followed inside this company's
 * own folder; anything else falls back to the standard path.
 */
export function checkinPhotoPath(checkin: CheckinRef, companyId: string, slot: string): string {
  const linked = storagePathFromPhotoUrl(checkin.exteriorData?.[slot])
  return linked && linked.startsWith(`${companyId}/`) && !linked.includes('..') ? linked : `${companyId}/${checkin.id}/${slot}.jpg`
}

async function download(admin: Admin, path: string): Promise<Buffer | null> {
  const { data } = await admin.storage.from('inspection-photos').download(path)
  return data ? Buffer.from(await data.arrayBuffer()) : null
}

const small = (buf: Buffer) => sharp(buf).rotate().resize(COMPARE_EDGE, COMPARE_EDGE, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()

export type CompareOutcome = 'not_checkout' | 'no_checkin' | 'compared' | 'not_comparable' | 'no_checkin_photo' | 'skipped'

export async function compareWithCheckin(inspectionId: string, companyId: string, slot: ExteriorSlot): Promise<{ outcome: CompareOutcome; found: number }> {
  const admin = createAdminClient()
  const { data: me } = await admin.from('vehicle_inspections').select('inspection_type').eq('id', inspectionId).maybeSingle()
  if (me?.inspection_type !== 'check_out') return { outcome: 'not_checkout', found: 0 }
  const checkin = await findCheckin(admin, inspectionId)
  if (!checkin) return { outcome: 'no_checkin', found: 0 }

  const record = async (outcome: Exclude<CompareOutcome, 'not_checkout' | 'no_checkin'>, found = 0) => {
    await admin.from('checkin_compares').upsert({
      inspection_id: inspectionId, slot, checkin_inspection_id: checkin.id, outcome, found,
      model: COMPARE_MODEL, prompt_version: COMPARE_VERSION, checked_at: new Date().toISOString(),
    })
    return { outcome, found }
  }

  // The photo changed, so whatever the last comparison said no longer applies.
  await admin.from('damage_suggestions')
    .update({ status: 'superseded', decided_at: new Date().toISOString() })
    .eq('inspection_id', inspectionId).eq('slot', slot).eq('kind', 'new_since_checkin').eq('status', 'pending')

  const checkinPath = checkinPhotoPath(checkin, companyId, slot)
  const [before, after] = await Promise.all([download(admin, checkinPath), download(admin, `${companyId}/${inspectionId}/${slot}.jpg`)])
  if (!before) return record('no_checkin_photo')
  if (!after) return record('skipped')

  const [b, a] = await Promise.all([small(before), small(after)])
  const result = await runAi({
    feature: 'compare',
    promptVersion: COMPARE_VERSION,
    model: COMPARE_MODEL,
    companyId,
    inspectionId,
    ...compareRequest(b.toString('base64'), a.toString('base64')),
    maxTokens: COMPARE_MAX_TOKENS,
    thinking: 'off',
    jsonSchema: COMPARE_SCHEMA as unknown as Record<string, unknown>,
  })
  if (!result.ok) return record('skipped')
  const parsed = parseCompare(result.message.content.map(x => (x.type === 'text' ? x.text : '')).join(''))
  if (!parsed) return record('skipped')
  if (!parsed.comparable) return record('not_comparable')

  if (parsed.newDamage.length) {
    const areaNumbers = parsed.newDamage.map(f => mapArea(f.where, slot, f.group))
    const typeNumbers = parsed.newDamage.map((f, i) => mapType(f.group, areaNumbers[i]))
    const [{ data: areas }, { data: types }] = await Promise.all([
      admin.from('damage_area_codes').select('id, aiag_code').in('aiag_code', areaNumbers.filter((n): n is number => n != null)),
      admin.from('damage_type_codes').select('id, aiag_code').in('aiag_code', typeNumbers),
    ])
    const areaId = new Map((areas ?? []).map(x => [x.aiag_code, x.id]))
    const typeId = new Map((types ?? []).map(x => [x.aiag_code, x.id]))
    const { error } = await admin.from('damage_suggestions').insert(parsed.newDamage.map((f, i) => ({
      inspection_id: inspectionId,
      slot,
      kind: 'new_since_checkin',
      checkin_inspection_id: checkin.id,
      damage_group: f.group,
      where_text: f.where || null,
      confidence: f.confidence,
      area_code_id: areaNumbers[i] != null ? areaId.get(areaNumbers[i]) ?? null : null,
      type_code_id: typeId.get(typeNumbers[i]) ?? null,
      view: SLOT_VIEW[slot],
      model: COMPARE_MODEL,
      prompt_version: COMPARE_VERSION,
    })))
    if (error) console.error('[checkin-compare] could not store', error.message)
  }
  return record('compared', parsed.newDamage.filter(f => f.confidence >= COMPARE_THRESHOLD).length)
}
