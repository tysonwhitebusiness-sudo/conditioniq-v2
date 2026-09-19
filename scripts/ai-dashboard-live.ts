// H · The admin AI dashboard's reads, against the real database, on a
// throwaway inspection: a logged call, two decided suggestions with a photo,
// the review queue before and after an approval. Removed afterwards. No AI
// calls are made.
//
//   npx tsx scripts/ai-dashboard-live.ts

import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const at = line.indexOf('=')
  if (at > 0 && !line.startsWith('#')) process.env[line.slice(0, at).trim()] ??= line.slice(at + 1).trim().replace(/^"|"$/g, '')
}

async function main() {
  const { createAdminClient } = await import('../lib/supabase/admin')
  const { loadAiDashboard, loadReviewQueue } = await import('../lib/ai/dashboard-data')
  const admin = createAdminClient()
  const failures: string[] = []
  const check = (name: string, ok: boolean) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failures.push(name) }

  const { data: company } = await admin.from('companies').select('id').limit(1).single()
  const co = company!.id
  let inspectionId: string | null = null, callId: string | null = null
  const path = () => `${co}/${inspectionId}/exteriorFrontPhoto.jpg`
  try {
    const { data: insp } = await admin.from('vehicle_inspections').insert({ company_id: co, status: 'completed', vin: 'TESTH0000000000001' }).select('id').single()
    inspectionId = insp!.id
    await admin.storage.from('inspection-photos').upload(path(), readFileSync('C:/Users/13143/ciq-ai-data/sets/compare/real-778768-1-rear-b.jpg'), { contentType: 'image/jpeg', upsert: true })
    const { data: call } = await admin.from('ai_calls').insert({ company_id: co, inspection_id: inspectionId, feature: 'damage', model: 'claude-opus-5', status: 'ok', cost_usd: 0.0123, duration_ms: 2100 }).select('id').single()
    callId = call!.id
    const now = new Date().toISOString()
    const { data: rows } = await admin.from('damage_suggestions').insert([
      { inspection_id: inspectionId, slot: 'exteriorFrontPhoto', damage_group: 'dent', where_text: 'tailgate', confidence: 0.91, status: 'accepted', decided_at: now },
      { inspection_id: inspectionId, slot: 'exteriorFrontPhoto', damage_group: 'scratch', where_text: 'bumper', confidence: 0.6, status: 'rejected', decided_at: now },
    ]).select('id')
    const ids = (rows ?? []).map(r => r.id)

    const d = await loadAiDashboard(1)
    check('the logged call counts toward spend', d.spend.totalUsd >= 0.0123 && d.spend.byFeature.some(f => f.feature === 'damage'))
    check('the inspection appears in per-inspection spend', d.spend.perInspection.inspections >= 1)
    check('decided suggestions count toward agreement', d.acceptance.byKind[0].accepted >= 1 && d.acceptance.byKind[0].rejected >= 1)
    check('both wait for review', d.review.toReview >= 2)

    const queue = await loadReviewQueue('to_review', 100)
    const mine = queue.filter(q => ids.includes(q.id))
    check('the review queue lists them', mine.length === 2)
    check('each carries a working photo link', mine.every(q => !!q.photoUrl) && (await fetch(mine[0].photoUrl!)).ok)

    await admin.from('damage_suggestions').update({ review_status: 'approved', reviewed_at: now }).eq('id', ids[0])
    const approved = await loadReviewQueue('approved', 100)
    const waiting = await loadReviewQueue('to_review', 100)
    check('an approval moves it to Approved', approved.some(q => q.id === ids[0]) && !waiting.some(q => q.id === ids[0]))
  } finally {
    if (callId) await admin.from('ai_calls').delete().eq('id', callId)
    if (inspectionId) {
      await admin.storage.from('inspection-photos').remove([path()])
      await admin.from('vehicle_inspections').delete().eq('id', inspectionId)
    }
    console.log('Removed the throwaway inspection, its photo, call and suggestions.')
  }
  if (failures.length) { console.error(`\n${failures.length} failed`); process.exit(1) }
  console.log('\nAI dashboard reads work.')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
