// H · Exports the examples approved on the admin AI dashboard into the private
// data folder, as the start of test sets and the example library drawn from
// real inspections rather than public datasets.
//
//   npx tsx scripts/ai-lab/export-reviewed.ts
//
// Writes <data>/sets/reviewed/<id>.jpg (and <id>-checkin.jpg for comparisons)
// with reviewed.json: what the AI suggested and what the inspector decided.
// Photos never enter the repo.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SETS_DIR, loadEnv } from './config'
loadEnv()

async function main() {
  const { createAdminClient } = await import('../../lib/supabase/admin')
  const { checkinPhotoPath } = await import('../../lib/ai/checkin-compare-server')
  const admin = createAdminClient()
  const out = join(SETS_DIR, 'reviewed')
  mkdirSync(out, { recursive: true })
  const { data, error } = await admin.from('damage_suggestions')
    .select(`id, kind, slot, damage_group, where_text, confidence, status, model, prompt_version, inspection_id, checkin_inspection_id, reviewed_at,
      area:area_code_id(label, aiag_code), type:type_code_id(label, aiag_code),
      marker:marker_id(area:area_code_id(label, aiag_code), type:type_code_id(label, aiag_code)),
      inspection:inspection_id(company_id)`)
    .eq('review_status', 'approved')
  if (error) throw error
  const items = []
  for (const r of (data ?? []) as any[]) {
    const company = r.inspection?.company_id
    if (!company) continue
    const photo = await admin.storage.from('inspection-photos').download(`${company}/${r.inspection_id}/${r.slot}.jpg`)
    if (!photo.data) continue
    writeFileSync(join(out, `${r.id}.jpg`), Buffer.from(await photo.data.arrayBuffer()))
    let checkinFile: string | null = null
    if (r.kind === 'new_since_checkin' && r.checkin_inspection_id) {
      const { data: c } = await admin.from('vehicle_inspections').select('id, company_id, created_at, exterior_data').eq('id', r.checkin_inspection_id).maybeSingle()
      const before = c ? await admin.storage.from('inspection-photos').download(checkinPhotoPath({ id: c.id, createdAt: c.created_at, exteriorData: c.exterior_data }, c.company_id, r.slot)) : null
      if (before?.data) {
        checkinFile = `reviewed/${r.id}-checkin.jpg`
        writeFileSync(join(SETS_DIR, checkinFile), Buffer.from(await before.data.arrayBuffer()))
      }
    }
    items.push({
      id: r.id, kind: r.kind, slot: r.slot, file: `reviewed/${r.id}.jpg`, checkinFile,
      suggested: { group: r.damage_group, where: r.where_text, confidence: Number(r.confidence), area: r.area, type: r.type, model: r.model, promptVersion: r.prompt_version },
      // accepted: the suggestion was right; edited: right damage, recorded differently; rejected: not damage (or not new).
      decision: r.status,
      recorded: r.marker ? { area: r.marker.area, type: r.marker.type } : null,
      reviewedAt: r.reviewed_at,
    })
  }
  writeFileSync(join(SETS_DIR, 'reviewed.json'), JSON.stringify({ exported: new Date().toISOString(), items }, null, 1))
  console.log(`Exported ${items.length} approved examples to ${out}`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
