// Phase 9 (Damage Picker Foundation): resolves a vehicle's decoded VIN data to
// the curated diagram library (supabase/migrations/20260807000000_create_
// vehicle_model_assets.sql) — exact make/model match first, generic category
// fallback otherwise. 2D and 3D resolve independently per asset_type. Consumed
// by resolveVehicleMasterId (lib/work-order-status.ts), which persists the
// result on vehicle_master so it's computed once, not on every visit.

export type AssetCategory = 'sedan' | 'suv' | 'truck' | 'van'
export type AssetType = '2d' | '3d'

const BUCKET = 'vehicle-model-assets'

// NHTSA vPIC's free-text "Body Class" values (e.g. "Sedan/Saloon", "Sport
// Utility Vehicle (SUV)", "Pickup", "Van") have no parsed mapping anywhere in
// the codebase yet — this is that mapping. Unrecognized/absent values fall
// through to null, same as vehicle_template being left unset.
const BODY_CLASS_PATTERNS: [RegExp, AssetCategory][] = [
  [/pickup/i, 'truck'],
  [/van|minivan/i, 'van'],
  [/suv|sport utility|crossover/i, 'suv'],
  [/sedan|saloon|coupe|hatchback|convertible|wagon/i, 'sedan'],
]

export function normalizeBodyClass(bodyClass: string | null | undefined): AssetCategory | null {
  if (!bodyClass) return null
  for (const [pattern, category] of BODY_CLASS_PATTERNS) {
    if (pattern.test(bodyClass)) return category
  }
  return null
}

async function resolveOne(
  supabase: any,
  category: AssetCategory,
  make: string | null | undefined,
  model: string | null | undefined,
  assetType: AssetType,
): Promise<string | null> {
  if (make && model) {
    const { data: exact } = await supabase
      .from('vehicle_model_assets')
      .select('id')
      .eq('category', category)
      .eq('asset_type', assetType)
      .ilike('make', make)
      .ilike('model', model)
      .maybeSingle()
    if (exact) return exact.id
  }

  const { data: generic } = await supabase
    .from('vehicle_model_assets')
    .select('id')
    .eq('category', category)
    .eq('asset_type', assetType)
    .is('make', null)
    .is('model', null)
    .maybeSingle()
  return generic?.id ?? null
}

export async function resolveVehicleModelAssets(
  supabase: any,
  category: AssetCategory | null,
  make: string | null | undefined,
  model: string | null | undefined,
): Promise<{ modelAsset2dId: string | null; modelAsset3dId: string | null }> {
  if (!category) return { modelAsset2dId: null, modelAsset3dId: null }
  const [modelAsset2dId, modelAsset3dId] = await Promise.all([
    resolveOne(supabase, category, make, model, '2d'),
    resolveOne(supabase, category, make, model, '3d'),
  ])
  return { modelAsset2dId, modelAsset3dId }
}

export interface VehicleAssetViews {
  top: string
  front: string
  side: string
  rear: string
}

// Phase 10: resolves an already-picked 2D vehicle_model_assets.id (from
// vehicle_master.model_asset_2d_id) to its 4 public view image URLs, same
// getPublicUrl() pattern lib/lot-actions.ts already uses for lot-backgrounds.
export async function getVehicle2dAssetViews(
  supabase: any,
  modelAssetId: string,
): Promise<VehicleAssetViews | null> {
  const { data } = await supabase
    .from('vehicle_model_assets')
    .select('top_path, front_path, side_path, rear_path')
    .eq('id', modelAssetId)
    .maybeSingle()
  if (!data) return null

  const toUrl = (path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl as string
  return {
    top: toUrl(data.top_path),
    front: toUrl(data.front_path),
    side: toUrl(data.side_path),
    rear: toUrl(data.rear_path),
  }
}

// Phase 11: resolves an already-picked 3D vehicle_model_assets.id (from
// vehicle_master.model_asset_3d_id) to its public GLB URL — same pattern as
// getVehicle2dAssetViews above, just a single file instead of four.
export async function getVehicle3dAssetUrl(
  supabase: any,
  modelAssetId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('vehicle_model_assets')
    .select('storage_path')
    .eq('id', modelAssetId)
    .maybeSingle()
  if (!data?.storage_path) return null
  return supabase.storage.from(BUCKET).getPublicUrl(data.storage_path).data.publicUrl as string
}
