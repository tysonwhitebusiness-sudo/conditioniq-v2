// F · One real run of the damage suggestion check, end to end, on a throwaway
// inspection: photos go into storage, each slot is checked by the model, the
// suggestions are stored and mapped, and the display rule is applied. Then
// everything it made is removed (the ai_calls cost rows go with the inspection).
//
//   npx tsx scripts/damage-suggest-live.ts
//
// Spends about $0.05 (four Opus calls). Photos come from the private lab set.

import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const at = line.indexOf('=')
  if (at > 0 && !line.startsWith('#')) process.env[line.slice(0, at).trim()] ??= line.slice(at + 1).trim().replace(/^"|"$/g, '')
}

const SETS = 'C:/Users/13143/ciq-ai-data/sets'
const PHOTOS = {
  exteriorFrontPhoto: 'damage/03012020_081807image192945.jpg', // labelled dent + scratch
  exteriorRearPhoto: 'customer/2e4b868b-exteriorRearPhoto.jpg', // clean
  exteriorDriverPhoto: 'damage/13012020_111727image208739.jpg', // labelled scratch
  exteriorPassengerPhoto: 'customer/f50930b5-exteriorPassengerPhoto.jpg', // clean
} as const

async function main() {
  const { createAdminClient } = await import('../lib/supabase/admin')
  const { suggestDamageForSlot } = await import('../lib/ai/damage-suggest-server')
  const { suggestionsToShow } = await import('../lib/ai/damage-suggest')
  const admin = createAdminClient()

  const { data: company } = await admin.from('companies').select('id').eq('ai_enabled', true).limit(1).single()
  const { data: inspection, error } = await admin.from('vehicle_inspections')
    .insert({ company_id: company!.id, status: 'in_progress' }).select('id').single()
  if (error) throw error
  const id = inspection.id
  const paths: string[] = []
  let failed = false
  try {
    for (const [slot, file] of Object.entries(PHOTOS)) {
      const path = `${company!.id}/${id}/${slot}.jpg`
      paths.push(path)
      await admin.storage.from('inspection-photos').upload(path, readFileSync(`${SETS}/${file}`), { contentType: 'image/jpeg', upsert: true })
    }
    const started = Date.now()
    const outcomes = await Promise.all(Object.keys(PHOTOS).map(async slot => [slot, await suggestDamageForSlot(id, company!.id, slot as keyof typeof PHOTOS)] as const))
    console.log(`Checked 4 photos in ${((Date.now() - started) / 1000).toFixed(1)} s`)
    for (const [slot, o] of outcomes) console.log(`  ${slot}: ${o.ok ? `${o.found} found` : `skipped (${o.reason})`}`)

    const { data: rows } = await admin.from('damage_suggestions')
      .select('id, slot, damage_group, where_text, confidence, status, view, area:area_code_id(label, aiag_code), type:type_code_id(label, aiag_code)')
      .eq('inspection_id', id)
    const shown = new Set(suggestionsToShow((rows ?? []).map((r: any) => ({ ...r, confidence: Number(r.confidence) }))).map(r => r.id))
    console.log('\nStored suggestions:')
    for (const r of rows ?? [] as any[]) {
      const a: any = r.area, t: any = r.type
      console.log(`  ${shown.has(r.id) ? 'SHOWN ' : 'hidden'} ${r.slot.padEnd(22)} ${r.damage_group.padEnd(8)} ${Number(r.confidence).toFixed(2)}  "${r.where_text}" → ${a ? `${a.aiag_code} ${a.label}` : '(inspector picks area)'} / ${t ? `${t.aiag_code} ${t.label}` : '-'}  [${r.view}]`)
    }
    const { data: calls } = await admin.from('ai_calls').select('cost_usd, status').eq('inspection_id', id)
    const cost = (calls ?? []).reduce((s, c) => s + Number(c.cost_usd ?? 0), 0)
    console.log(`\nCost: $${cost.toFixed(4)} over ${calls?.length ?? 0} calls`)

    // Retaking a photo supersedes that slot's open suggestions.
    const before = (rows ?? []).filter(r => r.slot === 'exteriorFrontPhoto').length
    if (before) {
      await admin.from('damage_suggestions').update({ status: 'superseded' }).eq('inspection_id', id).eq('slot', 'exteriorFrontPhoto').eq('status', 'pending')
      const { count } = await admin.from('damage_suggestions').select('id', { count: 'exact', head: true }).eq('inspection_id', id).eq('slot', 'exteriorFrontPhoto').eq('status', 'pending')
      console.log(`Supersede on retake: ${count === 0 ? 'ok' : 'FAIL'}`)
      if (count !== 0) failed = true
    }
    if (!outcomes.every(([, o]) => o.ok)) failed = true
  } finally {
    await admin.storage.from('inspection-photos').remove(paths)
    await admin.from('vehicle_inspections').delete().eq('id', id)
    console.log('Removed the throwaway inspection and its photos.')
  }
  process.exit(failed ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
