// G · One real run of check-out against check-in, end to end, on a throwaway
// vehicle: a completed check-in and an in-progress check-out, linked the way
// the app links them, each side compared by the model, the suggestions stored,
// the display rule applied, and the finished check-out's report read back.
// Everything it made is removed afterwards.
//
//   npx tsx scripts/checkin-compare-live.ts
//
// Four live calls (about $0.03). Photos come from the private lab set:
//   passenger  a customer truck inspected twice, with a real damage crop pasted onto the check-out side: new
//   rear       a customer SUV inspected twice, the same tailgate dent both times: nothing new
//   driver     VehiDE damage present in both photos: nothing new
//   front      no check-in photo: says so

import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const at = line.indexOf('=')
  if (at > 0 && !line.startsWith('#')) process.env[line.slice(0, at).trim()] ??= line.slice(at + 1).trim().replace(/^"|"$/g, '')
}

const SETS = 'C:/Users/13143/ciq-ai-data/sets/compare/'
const PAIRS: Record<string, [string | null, string]> = {
  exteriorPassengerPhoto: ['real-D88858-1-passenger-a.jpg', 'added-D88858-1-passenger-b.jpg'],
  exteriorRearPhoto: ['real-778768-1-rear-a.jpg', 'real-778768-1-rear-b.jpg'],
  exteriorDriverPhoto: ['v-02012020_141536image914494-shifted.jpg', 'v-02012020_141536image914494-after.jpg'],
  exteriorFrontPhoto: [null, 'real-778768-1-front-b.jpg'],
}

async function main() {
  const { createAdminClient } = await import('../lib/supabase/admin')
  const { compareWithCheckin } = await import('../lib/ai/checkin-compare-server')
  const { suggestionsToShowAll } = await import('../lib/ai/damage-suggest')
  const { COMPARE_THRESHOLD } = await import('../lib/ai/checkin-compare')
  const admin = createAdminClient()
  const failures: string[] = []
  const check = (name: string, ok: boolean) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failures.push(name) }

  const { data: company } = await admin.from('companies').select('id').eq('ai_enabled', true).limit(1).single()
  const co = company!.id
  const { data: master } = await admin.from('vehicle_master').select('id').limit(1).single()
  const vin = `TESTG${Date.now().toString().slice(-12)}`
  const url = (path: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/sign/inspection-photos/${path}?token=test`

  const paths: string[] = []
  let checkin: { id: string } | null = null, vehicle: { id: string } | null = null, checkout: { id: string } | null = null
  try {
    const must = <T,>(r: { data: T | null; error: any }, what: string): T => { if (!r.data) throw new Error(`${what}: ${r.error?.message}`); return r.data }
    checkin = must(await admin.from('vehicle_inspections').insert({
      company_id: co, vin, status: 'completed', inspection_type: 'check_in', created_at: new Date(Date.now() - 3 * 864e5).toISOString(),
    }).select('id').single(), 'check-in')
    vehicle = must(await admin.from('storage_vehicles').insert({
      company_id: co, vin, vehicle_master_id: master!.id, checkin_inspection_id: checkin!.id,
      work_order_status: 'in_storage', status: 'inspected', lifecycle_status: 'on_lot',
    }).select('id').single(), 'vehicle')
    checkout = must(await admin.from('vehicle_inspections').insert({
      company_id: co, vin, status: 'in_progress', inspection_type: 'check_out', vehicle_id: vehicle!.id,
    }).select('id').single(), 'check-out')
    // Check-in photos under an older-style folder, reached through the saved links.
    const exterior: Record<string, string> = {}
    for (const [slot, [before, after]] of Object.entries(PAIRS)) {
      if (before) {
        const p = `${co}/legacy-${checkin!.id}/${slot}.jpg`
        await admin.storage.from('inspection-photos').upload(p, readFileSync(SETS + before), { contentType: 'image/jpeg', upsert: true })
        paths.push(p)
        exterior[slot] = url(p)
      }
      const q = `${co}/${checkout!.id}/${slot}.jpg`
      await admin.storage.from('inspection-photos').upload(q, readFileSync(SETS + after), { contentType: 'image/jpeg', upsert: true })
      paths.push(q)
    }
    await admin.from('vehicle_inspections').update({ exterior_data: exterior }).eq('id', checkin!.id)

    const started = Date.now()
    const outcomes = Object.fromEntries(await Promise.all(Object.keys(PAIRS).map(async slot => [slot, await compareWithCheckin(checkout!.id, co, slot as any)])))
    console.log(`Compared 4 sides in ${((Date.now() - started) / 1000).toFixed(1)} s`)
    for (const [slot, o] of Object.entries(outcomes) as [string, { outcome: string; found: number }][]) console.log(`  ${slot}: ${o.outcome}, ${o.found} shown`)
    const { data: rows } = await admin.from('damage_suggestions').select('id, slot, kind, damage_group, where_text, confidence, status').eq('inspection_id', checkout!.id)
    for (const r of rows ?? []) console.log(`  stored ${r.kind} ${r.slot} ${r.damage_group} ${Number(r.confidence).toFixed(2)} "${r.where_text}"`)
    const shown = suggestionsToShowAll((rows ?? []).map(r => ({ ...r, confidence: Number(r.confidence) })), COMPARE_THRESHOLD)

    check('the damage added since check-in is new at check-out', outcomes.exteriorPassengerPhoto.outcome === 'compared' && shown.some(s => s.slot === 'exteriorPassengerPhoto'))
    check('the dent present at both inspections is not new', outcomes.exteriorRearPhoto.outcome === 'compared' && !shown.some(s => s.slot === 'exteriorRearPhoto'))
    check('damage present in both photos is not new', outcomes.exteriorDriverPhoto.outcome === 'compared' && !shown.some(s => s.slot === 'exteriorDriverPhoto'))
    check('a side with no check-in photo says so', outcomes.exteriorFrontPhoto.outcome === 'no_checkin_photo')
    const { data: compares } = await admin.from('checkin_compares').select('slot').eq('inspection_id', checkout!.id)
    check('each side is recorded for the report', compares?.length === 4)

    // Confirm the finding the way the inspector would, then finish and read the report.
    const hit = shown.find(s => s.slot === 'exteriorPassengerPhoto')
    if (hit) {
      const { data: codes } = await admin.from('damage_area_codes').select('id').eq('aiag_code', 21).single()
      const { data: types } = await admin.from('damage_type_codes').select('id').eq('aiag_code', 21).single()
      const { data: sev } = await admin.from('damage_severity_codes').select('id').eq('code', 5).single()
      const { data: marker } = await admin.from('damage_markers').insert({
        company_id: co, vehicle_id: vehicle!.id, inspection_id: checkout!.id, source: 'cr', vehicle_template: 'sedan',
        area_code_id: codes!.id, type_code_id: types!.id, severity_code_id: sev!.id, x_position: 50, y_position: 30, suggestion_id: hit.id,
      }).select('id').single()
      await admin.from('damage_suggestions').update({ status: 'accepted', marker_id: marker!.id }).eq('id', hit.id)
    }
    await admin.from('vehicle_inspections').update({ status: 'completed' }).eq('id', checkout!.id)
    await admin.from('storage_vehicles').update({ checkout_inspection_id: checkout!.id }).eq('id', vehicle!.id)
    const { renderInspectionReport } = await import('../lib/report/render')
    const { buffer } = await renderInspectionReport(checkout!.id)
    const { getDocumentProxy, extractText } = await import('unpdf')
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(buffer)), { mergePages: true })
    const flat = (text as string).replace(/\s+/g, ' ')
    const line = flat.match(/Compared with the check-in[^.]*\.[^.]*\./)?.[0] ?? flat.match(/Nothing to compare[^.]*\./)?.[0] ?? '(no comparison line)'
    console.log(`  report: "${line}"`)
    check('the report names the confirmed new damage', /new damage confirmed by the inspector at pin 1/.test(flat))
    check('the report says which side had no check-in photo', /front photo could not be compared/.test(flat))
    check('the pin says it is new since check-in', flat.includes('New since check-in, confirmed by inspector'))
    const { data: calls } = await admin.from('ai_calls').select('cost_usd').eq('inspection_id', checkout!.id).eq('feature', 'compare')
    console.log(`Cost: $${(calls ?? []).reduce((s, c) => s + Number(c.cost_usd ?? 0), 0).toFixed(4)} over ${calls?.length ?? 0} comparisons`)
  } finally {
    if (paths.length) await admin.storage.from('inspection-photos').remove(paths)
    // Inspections first: the check-out points at the vehicle, which blocks deleting it.
    const ids = [checkout?.id, checkin?.id].filter((x): x is string => !!x)
    if (ids.length) await admin.from('vehicle_inspections').delete().in('id', ids)
    if (vehicle) {
      const { error } = await admin.from('storage_vehicles').delete().eq('id', vehicle.id)
      if (error) console.error(`Could not remove the throwaway vehicle ${vehicle.id}: ${error.message}`)
    }
    console.log('Removed the throwaway vehicle, inspections and photos.')
  }
  if (failures.length) { console.error(`\n${failures.length} failed`); process.exit(1) }
  console.log('\nCheck-in comparison works end to end.')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
