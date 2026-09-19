import sharp from 'sharp'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAi } from './client'
import { DAMAGE_MODEL, DAMAGE_SETUP_VERSION, DAMAGE_SYSTEM, DAMAGE_USER_TEXT, DAMAGE_MAX_TOKENS } from './damage-setup'
import { mapArea, mapType, parseDamageFindings, SLOT_VIEW, type ExteriorSlot } from './damage-suggest'

if (typeof window !== 'undefined') throw new Error('lib/ai/damage-suggest-server is server-only')

// F · Check one exterior photo for damage and store what was seen as
// suggestions. Nothing is recorded as damage here: a suggestion only becomes a
// pin when the inspector places it and sets the severity.
//
// The photo is read from our own storage by its known path, never from a URL
// the phone sends. It goes to the model at 1024 px, the size the lab tested.
// Retaking a photo checks it again and supersedes that slot's open suggestions.

export type SuggestOutcome =
  | { ok: true; found: number }
  | { ok: false; reason: string }

export async function suggestDamageForSlot(inspectionId: string, companyId: string, slot: ExteriorSlot): Promise<SuggestOutcome> {
  const admin = createAdminClient()

  const { data: file, error: downloadError } = await admin.storage.from('inspection-photos').download(`${companyId}/${inspectionId}/${slot}.jpg`)
  if (downloadError || !file) return { ok: false, reason: 'photo not found' }
  const image = await sharp(Buffer.from(await file.arrayBuffer()))
    .rotate()
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()

  const result = await runAi({
    feature: 'damage',
    promptVersion: DAMAGE_SETUP_VERSION,
    model: DAMAGE_MODEL,
    companyId,
    inspectionId,
    system: DAMAGE_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.toString('base64') } },
        { type: 'text', text: DAMAGE_USER_TEXT },
      ],
    }],
    maxTokens: DAMAGE_MAX_TOKENS,
    thinking: 'off',
  })
  if (!result.ok) return { ok: false, reason: result.reason }

  const text = result.message.content.map(b => (b.type === 'text' ? b.text : '')).join('')
  const findings = parseDamageFindings(text)

  // AIAG numbers → the picker's code rows.
  const areaNumbers = findings.map(f => mapArea(f.where, slot, f.group))
  const typeNumbers = findings.map((f, i) => mapType(f.group, areaNumbers[i]))
  const [{ data: areas }, { data: types }] = await Promise.all([
    admin.from('damage_area_codes').select('id, aiag_code').in('aiag_code', areaNumbers.filter((n): n is number => n != null)),
    admin.from('damage_type_codes').select('id, aiag_code').in('aiag_code', typeNumbers),
  ])
  const areaId = new Map((areas ?? []).map(a => [a.aiag_code, a.id]))
  const typeId = new Map((types ?? []).map(t => [t.aiag_code, t.id]))

  await admin.from('damage_suggestions')
    .update({ status: 'superseded', decided_at: new Date().toISOString() })
    .eq('inspection_id', inspectionId).eq('slot', slot).eq('status', 'pending')

  if (findings.length) {
    const { error } = await admin.from('damage_suggestions').insert(findings.map((f, i) => ({
      inspection_id: inspectionId,
      slot,
      damage_group: f.group,
      where_text: f.where || null,
      confidence: f.confidence,
      area_code_id: areaNumbers[i] != null ? areaId.get(areaNumbers[i]) ?? null : null,
      type_code_id: typeId.get(typeNumbers[i]) ?? null,
      view: SLOT_VIEW[slot],
      model: DAMAGE_MODEL,
      prompt_version: DAMAGE_SETUP_VERSION,
    })))
    if (error) return { ok: false, reason: `could not store: ${error.message}` }
  }
  return { ok: true, found: findings.length }
}
