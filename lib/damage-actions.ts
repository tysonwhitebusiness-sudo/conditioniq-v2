import { createClient } from '@/lib/supabase/client'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DamageAreaCode {
  id: string
  category: string
  label: string
  sort_order: number
}

export interface DamageTypeCode {
  id: string
  label: string
  sort_order: number
}

export interface DamageSeverityCode {
  id: string
  code: number
  label: string
  sort_order: number
}

export type DamageMarkerSource = 'intake' | 'outtake' | 'cr' | 'manual'
export type VehicleTemplate = 'sedan' | 'suv' | 'truck' | 'van'
export type DamageMarkerAssetType = '2d' | '3d'
export type DamageMarkerView = 'top' | 'front' | 'side' | 'rear'

export interface DamageMarker {
  id: string
  company_id: string
  vehicle_id: string
  source: DamageMarkerSource
  vehicle_template: VehicleTemplate
  area_code_id: string
  type_code_id: string
  severity_code_id: string
  x_position: number
  y_position: number
  // Phase 11: only set for 3D markers (asset_type = '3d') — the raycast hit
  // point's third axis, normalized to the loaded model's own bounding box on
  // the same 0-100 scale as x_position/y_position. Null for 2D markers.
  z_position: number | null
  note: string | null
  created_by: string | null
  created_at: string
  // Which specific model asset the marker was placed on, and — for 2D only —
  // which of the 4 views. Null on markers created before Phase 9/10/11 wired
  // the real diagram library in. "All" is never a stored view; it's a
  // read-time aggregation of the other 4 views, not its own value.
  model_asset_id: string | null
  asset_type: DamageMarkerAssetType | null
  view: DamageMarkerView | null
  // Phase 9: set on pins placed during a full inspection (null for intake,
  // outtake and manual pins), and an optional close-up photo's storage path.
  inspection_id?: string | null
  photo_path?: string | null
  area?: DamageAreaCode
  type?: DamageTypeCode
  severity?: DamageSeverityCode
}

const MARKER_SELECT = `
  *,
  area:area_code_id(id, category, label, sort_order),
  type:type_code_id(id, label, sort_order),
  severity:severity_code_id(id, code, label, sort_order)
`

// ── Reference lists ───────────────────────────────────────────────────────────

export async function getDamageAreaCodes(): Promise<DamageAreaCode[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('damage_area_codes')
    .select('id, category, label, sort_order')
    .eq('active', true)
    .order('sort_order')
  return data ?? []
}

export async function getDamageTypeCodes(): Promise<DamageTypeCode[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('damage_type_codes')
    .select('id, label, sort_order')
    .eq('active', true)
    .order('sort_order')
  return data ?? []
}

export async function getDamageSeverityCodes(): Promise<DamageSeverityCode[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('damage_severity_codes')
    .select('id, code, label, sort_order')
    .eq('active', true)
    .order('sort_order')
  return data ?? []
}

// ── Markers ───────────────────────────────────────────────────────────────────

export async function getDamageMarkersForVehicle(
  vehicleId: string,
  filter?: { modelAssetId?: string; view?: DamageMarkerView },
): Promise<DamageMarker[]> {
  const supabase = createClient()
  // Vehicle-level pins only. Pins from a full inspection belong to that
  // inspection's report and are read through lib/damage-server-actions.
  let query = supabase
    .from('damage_markers')
    .select(MARKER_SELECT)
    .eq('vehicle_id', vehicleId)
    .is('inspection_id', null)
  if (filter?.modelAssetId) query = query.eq('model_asset_id', filter.modelAssetId)
  if (filter?.view) query = query.eq('view', filter.view)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) { console.error('[damage] getMarkersForVehicle', error); return [] }
  return (data ?? []) as unknown as DamageMarker[]
}

export async function createDamageMarker(companyId: string, data: {
  vehicleId: string
  source: DamageMarkerSource
  vehicleTemplate: VehicleTemplate
  areaCodeId: string
  typeCodeId: string
  severityCodeId: string
  xPosition: number
  yPosition: number
  zPosition?: number
  note?: string
  createdBy?: string
  // Set by the Phase 10/11 taggers once they render against a real asset —
  // left undefined by the current placeholder tagger.
  modelAssetId?: string
  assetType?: DamageMarkerAssetType
  view?: DamageMarkerView
}): Promise<DamageMarker | null> {
  const supabase = createClient()
  const { data: created, error } = await supabase
    .from('damage_markers')
    .insert({
      company_id: companyId,
      vehicle_id: data.vehicleId,
      source: data.source,
      vehicle_template: data.vehicleTemplate,
      area_code_id: data.areaCodeId,
      type_code_id: data.typeCodeId,
      severity_code_id: data.severityCodeId,
      x_position: data.xPosition,
      y_position: data.yPosition,
      z_position: data.zPosition ?? null,
      note: data.note ?? null,
      created_by: data.createdBy ?? null,
      model_asset_id: data.modelAssetId ?? null,
      asset_type: data.assetType ?? null,
      view: data.view ?? null,
    })
    .select(MARKER_SELECT)
    .single()
  if (error) { console.error('[damage] createMarker', error); return null }
  return created as unknown as DamageMarker
}

export async function deleteDamageMarker(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('damage_markers').delete().eq('id', id)
  if (error) console.error('[damage] deleteMarker', error)
}

// ── Display ───────────────────────────────────────────────────────────────────

// e.g. "Fender Front Left — Dented - Paint/Chrome Broken — 1-3 in"
export function composeDamageLabel(
  area: { label: string } | null | undefined,
  type: { label: string } | null | undefined,
  severity: { label: string } | null | undefined,
): string {
  return [area?.label, type?.label, abbreviateSeverity(severity?.label)]
    .filter(Boolean)
    .join(' — ')
}

function abbreviateSeverity(label: string | undefined): string | undefined {
  return label?.replace(/\binches\b/, 'in').replace(/\binch\b/, 'in')
}
