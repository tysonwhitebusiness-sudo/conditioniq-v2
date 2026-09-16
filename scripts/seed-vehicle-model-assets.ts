/**
 * One-time seed for the curated vehicle diagram library (16 approved 3D GLB
 * models + 6 finalized 2D image sets) into the `vehicle-model-assets` Storage
 * bucket and the vehicle_model_assets table.
 *
 * Creates the public `vehicle-model-assets` Storage bucket on first run if it
 * doesn't already exist (idempotent, safe to leave to the script rather than
 * a manual dashboard step).
 *
 * Source layout expected at ASSET_SOURCE_DIR:
 *   {category}/3d/{make}_{model}.glb        (specific 3D models)
 *   {category}/3d/generic.glb                (3D generic fallback)
 *   {category}/2d/{make}_{model}/{view}.png  (specific 2D sets, one dir per model)
 *   {category}/2d/generic/{view}.png         (2D generic fallback)
 * where category in sedan/suv/truck/van and view in top/front/side/rear.
 * make/model are split on the FIRST underscore only, so hyphens (and any
 * further underscores) inside either are preserved as-is — e.g.
 * "mercedes-benz_sprinter" -> make "mercedes-benz", model "sprinter".
 *
 * Idempotent: re-running overwrites the storage objects (upsert: true) and
 * updates the matching vehicle_model_assets row in place instead of
 * duplicating it, same idempotency guarantee as seed-qa-account.ts.
 *
 * Usage:
 *   ASSET_SOURCE_DIR=/path/to/curated-library npx tsx scripts/seed-vehicle-model-assets.ts
 *
 * Requires in environment (or .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

const envPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envPath)) dotenv.config({ path: envPath })
else dotenv.config()

const BUCKET = 'vehicle-model-assets'
const CATEGORIES = ['sedan', 'suv', 'truck', 'van'] as const
const VIEWS = ['top', 'front', 'side', 'rear'] as const
type Category = typeof CATEGORIES[number]

const sourceDir = process.env.ASSET_SOURCE_DIR
if (!sourceDir) {
  console.error('Set ASSET_SOURCE_DIR to the curated asset library directory.')
  process.exit(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

function parseModelDirName(name: string): { make: string | null; model: string | null } {
  if (name === 'generic') return { make: null, model: null }
  const sep = name.indexOf('_')
  if (sep === -1) throw new Error(`Expected "{make}_{model}", got "${name}"`)
  return { make: name.slice(0, sep), model: name.slice(sep + 1) || null }
}

async function uploadFile(localPath: string, storagePath: string): Promise<void> {
  const buffer = fs.readFileSync(localPath)
  const contentType = localPath.endsWith('.glb') ? 'model/gltf-binary' : 'image/png'
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, { contentType, upsert: true })
  if (error) throw new Error(`Upload failed for ${storagePath}: ${error.message}`)
}

// NULL make/model (the generic row) can't round-trip through PostgREST's
// ON CONFLICT upsert against the partial unique indexes, so this matches the
// codebase's own resolveVehicleMasterId precedent instead: explicit
// select-then-insert-or-update.
async function upsertAssetRow(row: {
  category: Category; make: string | null; model: string | null
  asset_type: '2d' | '3d'; storage_path?: string
  top_path?: string; front_path?: string; side_path?: string; rear_path?: string
}): Promise<void> {
  let query = supabase.from('vehicle_model_assets').select('id')
    .eq('category', row.category).eq('asset_type', row.asset_type)
  query = row.make ? query.eq('make', row.make).eq('model', row.model!) : query.is('make', null).is('model', null)
  const { data: existing } = await query.maybeSingle()

  if (existing) {
    const { error } = await supabase.from('vehicle_model_assets')
      .update({ ...row, updated_at: new Date().toISOString() }).eq('id', existing.id)
    if (error) throw new Error(`Row update failed: ${error.message}`)
  } else {
    const { error } = await supabase.from('vehicle_model_assets').insert(row)
    if (error) throw new Error(`Row insert failed: ${error.message}`)
  }
}

async function seed3d(category: Category): Promise<void> {
  const dir = path.join(sourceDir!, category, '3d')
  if (!fs.existsSync(dir)) return
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.glb')) continue
    const { make, model } = parseModelDirName(file.replace(/\.glb$/, ''))
    const storagePath = `${category}/3d/${file}`
    await uploadFile(path.join(dir, file), storagePath)
    await upsertAssetRow({ category, make, model, asset_type: '3d', storage_path: storagePath })
    console.log(`3D: ${category}/${make ?? 'generic'}${model ? '/' + model : ''}`)
  }
}

async function seed2d(category: Category): Promise<void> {
  const dir = path.join(sourceDir!, category, '2d')
  if (!fs.existsSync(dir)) return
  for (const modelDir of fs.readdirSync(dir)) {
    const { make, model } = parseModelDirName(modelDir)
    const viewPaths: Record<string, string> = {}
    for (const view of VIEWS) {
      const localPath = path.join(dir, modelDir, `${view}.png`)
      if (!fs.existsSync(localPath)) throw new Error(`Missing ${view}.png for ${category}/2d/${modelDir}`)
      const storagePath = `${category}/2d/${modelDir}/${view}.png`
      await uploadFile(localPath, storagePath)
      viewPaths[`${view}_path`] = storagePath
    }

    await upsertAssetRow({ category, make, model, asset_type: '2d', ...viewPaths })
    console.log(`2D: ${category}/${make ?? 'generic'}${model ? '/' + model : ''}`)
  }
}

async function ensureBucket(): Promise<void> {
  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) throw new Error(`Could not list buckets: ${error.message}`)
  if (buckets.some(b => b.name === BUCKET)) return
  const { error: createError } = await supabase.storage.createBucket(BUCKET, { public: true })
  if (createError) throw new Error(`Could not create bucket ${BUCKET}: ${createError.message}`)
  console.log(`Created bucket ${BUCKET} (public).`)
}

async function main() {
  await ensureBucket()
  for (const category of CATEGORIES) {
    await seed3d(category)
    await seed2d(category)
  }
  console.log('Done.')
}

main().catch(e => { console.error(e); process.exit(1) })
