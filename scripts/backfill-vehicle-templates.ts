/**
 * Backfills vehicle_master.vehicle_template (and the model asset ids that follow
 * from it) for rows created before the damage-tagger work shipped.
 *
 * Why this exists: the vehicle_master backfill migration seeded year/make/model
 * from storage_vehicles but never set vehicle_template. The checkpoint route
 * refuses to open without one ("no body-type template set"), so every
 * pre-existing vehicle is locked out of intake/outtake until this runs.
 *
 * Strategy per row: decode the VIN via NHTSA vPIC, map its Body Class through
 * the same normalizeBodyClass() the app uses, then resolve model assets with the
 * same resolveVehicleModelAssets(). No new heuristic is introduced here — this
 * reuses the app's own logic so a backfilled row is indistinguishable from one
 * created by the intake form.
 *
 * Rows whose VIN will not decode, or whose Body Class has no mapping, are left
 * null and reported. They need the Set Template modal, and that is the correct
 * outcome rather than guessing a body type onto a customer's vehicle.
 *
 * Usage:
 *   npx tsx scripts/backfill-vehicle-templates.ts            # dry run, writes nothing
 *   npx tsx scripts/backfill-vehicle-templates.ts --apply    # performs the update
 *   npx tsx scripts/backfill-vehicle-templates.ts --apply --company "Big Rig Parking"
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from
 * .env.local, same as scripts/seed-qa-account.ts).
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'
import { normalizeBodyClass, resolveVehicleModelAssets } from '../lib/vehicle-model-assets'

const envPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envPath)) dotenv.config({ path: envPath })
else dotenv.config()

const APPLY = process.argv.includes('--apply')
const companyFlagIdx = process.argv.indexOf('--company')
const COMPANY_FILTER = companyFlagIdx !== -1 ? process.argv[companyFlagIdx + 1] : null

// vPIC is free and unauthenticated; keep a courteous gap between calls.
const VIN_DECODE_DELAY_MS = 250

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function decodeBodyClass(vin: string): Promise<string | null> {
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`)
    if (!res.ok) return null
    const json: any = await res.json()
    const row = (json.Results ?? []).find((v: any) => v.Variable === 'Body Class')
    return row?.Value || null
  } catch {
    return null
  }
}

// sedan/suv -> standard, truck/van -> oversized. Mirrors
// defaultSizeClassForTemplate() in lib/work-order-status.ts, inlined so this
// script does not pull the browser Supabase client into a node process.
function defaultSizeClass(template: string): 'standard' | 'oversized' {
  return template === 'truck' || template === 'van' ? 'oversized' : 'standard'
}

async function main() {
  console.log(APPLY ? '── APPLYING CHANGES ──' : '── DRY RUN (no writes; pass --apply to commit) ──')

  let query = supabase
    .from('vehicle_master')
    .select('id, vin, year, make, model, size_class, company_id, companies!inner(name)')
    .is('vehicle_template', null)
  if (COMPANY_FILTER) query = query.eq('companies.name', COMPANY_FILTER)

  const { data: rows, error } = await query
  if (error) { console.error('Query failed:', error); process.exit(1) }
  if (!rows?.length) { console.log('Nothing to backfill.'); return }

  console.log(`${rows.length} vehicle_master rows missing a template.\n`)

  const resolved: Record<string, number> = {}
  const unresolved: { vin: string; company: string; make: string | null; model: string | null; bodyClass: string | null }[] = []

  for (const row of rows as any[]) {
    const company = row.companies?.name ?? '(unknown)'
    const bodyClass = await decodeBodyClass(row.vin)
    const template = normalizeBodyClass(bodyClass)

    if (!template) {
      unresolved.push({ vin: row.vin, company, make: row.make, model: row.model, bodyClass })
      console.log(`  SKIP  ${row.vin}  ${company}  ${row.make ?? ''} ${row.model ?? ''}  bodyClass=${bodyClass ?? 'none'}`)
      await sleep(VIN_DECODE_DELAY_MS)
      continue
    }

    const { modelAsset2dId, modelAsset3dId } = await resolveVehicleModelAssets(
      supabase, template, row.make, row.model,
    )
    resolved[template] = (resolved[template] ?? 0) + 1
    console.log(`  SET   ${row.vin}  ${company}  -> ${template}${modelAsset2dId ? ' (2d)' : ''}${modelAsset3dId ? ' (3d)' : ''}`)

    if (APPLY) {
      const patch: Record<string, unknown> = {
        vehicle_template: template,
        model_asset_2d_id: modelAsset2dId,
        model_asset_3d_id: modelAsset3dId,
        updated_at: new Date().toISOString(),
      }
      // Only set size_class when it is not already chosen — an operator's
      // explicit choice outranks this default.
      if (!row.size_class) patch.size_class = defaultSizeClass(template)

      const { error: upErr } = await supabase.from('vehicle_master').update(patch).eq('id', row.id)
      if (upErr) console.error(`  FAIL  ${row.vin}:`, upErr.message)
    }
    await sleep(VIN_DECODE_DELAY_MS)
  }

  console.log('\n── Summary ──')
  for (const [template, n] of Object.entries(resolved)) console.log(`  ${template}: ${n}`)
  console.log(`  unresolved (need Set Template): ${unresolved.length}`)
  if (unresolved.length) {
    const byCompany: Record<string, number> = {}
    for (const u of unresolved) byCompany[u.company] = (byCompany[u.company] ?? 0) + 1
    for (const [c, n] of Object.entries(byCompany)) console.log(`    ${c}: ${n}`)
  }
  if (!APPLY) console.log('\nDry run only. Re-run with --apply to write.')
}

main().catch(e => { console.error(e); process.exit(1) })
