import { createClient } from '@/lib/supabase/client'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface LotSpot {
  id: string
  company_id: string
  location_id: string | null
  label: string
  x_position: number
  y_position: number
  width: number
  height: number
  rotation: number
  custom_color: string | null
  notes: string | null
  created_at: string
  active_assignment: ActiveAssignment | null
}

// ── Shapes (zones, borders, markers) ─────────────────────────────────────────

export interface ZoneConfig   { x: number; y: number; width: number; height: number }
export interface BorderConfig { points: { x: number; y: number }[]; closed: boolean }
export interface MarkerConfig { x: number; y: number; marker_type: 'entrance' | 'exit' | 'custom' }
export type ShapeConfig = ZoneConfig | BorderConfig | MarkerConfig

export interface LotShape {
  id: string
  company_id: string
  location_id: string | null
  shape_type: 'zone' | 'border' | 'marker'
  label: string | null
  color: string
  fill_opacity: number
  stroke_width: number
  config: ShapeConfig
  created_at: string
}

export interface ActiveAssignment {
  id: string
  spot_id: string
  vehicle_id: string
  assigned_at: string
  assigned_by: string | null
  vehicle: AssignedVehicle | null
}

export interface AssignedVehicle {
  id: string
  vin: string
  year: string | null
  make: string | null
  model: string | null
  lifecycle_status: string | null
  arrived_at: string
  released_at: string | null
  checkin_inspection_id: string | null
  latest_score: number | null
}

export interface AvailableVehicle {
  id: string
  vin: string
  year: string | null
  make: string | null
  model: string | null
  lifecycle_status: string | null
}

// ── Label generation ───────────────────────────────────────────────────────────

export function generateNextLabel(existing: string[]): string {
  const used = new Set(existing)
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    for (let n = 1; n <= 20; n++) {
      const label = `${letter}${n}`
      if (!used.has(label)) return label
    }
  }
  return `Z${existing.length + 1}`
}

// ── Spots ─────────────────────────────────────────────────────────────────────

export async function getLotSpots(
  companyId: string,
  locationId?: string | null,
): Promise<LotSpot[]> {
  const supabase = createClient()

  let q = supabase.from('lot_spots').select('*').eq('company_id', companyId).order('label')
  if (locationId) q = q.eq('location_id', locationId)
  else if (locationId === null) q = q.is('location_id', null)

  const { data: spots } = await q
  if (!spots?.length) return []

  const { data: assignments } = await supabase
    .from('lot_vehicle_assignments')
    .select(`
      id, spot_id, vehicle_id, assigned_at, assigned_by,
      vehicle:storage_vehicles(id, vin, year, make, model, lifecycle_status, arrived_at, released_at, checkin_inspection_id, latest_score)
    `)
    .in('spot_id', spots.map(s => s.id))
    .is('unassigned_at', null)

  const bySpot: Record<string, ActiveAssignment> = {}
  for (const a of (assignments ?? [])) bySpot[a.spot_id] = a as unknown as ActiveAssignment

  return spots.map(s => ({ ...s, active_assignment: bySpot[s.id] ?? null }))
}

export async function createLotSpot(
  companyId: string,
  data: { label: string; x_position: number; y_position: number; notes?: string; location_id?: string | null },
): Promise<LotSpot | null> {
  const supabase = createClient()
  const { data: spot, error } = await supabase
    .from('lot_spots')
    .insert({
      company_id: companyId,
      label: data.label,
      x_position: data.x_position,
      y_position: data.y_position,
      notes: data.notes ?? null,
      location_id: data.location_id ?? null,
    })
    .select()
    .single()
  if (error) { console.error('[lot] createSpot', error); return null }
  return { ...spot, active_assignment: null }
}

export async function updateLotSpot(
  spotId: string,
  updates: Partial<{
    label: string; x_position: number; y_position: number; notes: string | null
    width: number; height: number; rotation: number; custom_color: string | null
  }>,
): Promise<void> {
  const supabase = createClient()
  await supabase.from('lot_spots').update(updates).eq('id', spotId)
}

export async function deleteLotSpot(spotId: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('lot_spots').delete().eq('id', spotId)
}

// ── Assignments ───────────────────────────────────────────────────────────────

export async function assignVehicleToSpot(
  spotId: string,
  vehicleId: string,
  assignedBy: string,
): Promise<void> {
  const supabase = createClient()
  await supabase.from('lot_vehicle_assignments').insert({ spot_id: spotId, vehicle_id: vehicleId, assigned_by: assignedBy })
}

export async function unassignVehicleFromSpot(assignmentId: string): Promise<void> {
  const supabase = createClient()
  await supabase
    .from('lot_vehicle_assignments')
    .update({ unassigned_at: new Date().toISOString() })
    .eq('id', assignmentId)
}

export async function getAvailableVehicles(companyId: string): Promise<AvailableVehicle[]> {
  const supabase = createClient()
  const { data: vehicles } = await supabase
    .from('storage_vehicles')
    .select('id, vin, year, make, model, lifecycle_status')
    .eq('company_id', companyId)
    .neq('lifecycle_status', 'released')
    .order('arrived_at', { ascending: false })

  if (!vehicles?.length) return []

  const { data: active } = await supabase
    .from('lot_vehicle_assignments')
    .select('vehicle_id')
    .is('unassigned_at', null)

  const assigned = new Set((active ?? []).map(a => a.vehicle_id))
  return vehicles.filter(v => !assigned.has(v.id))
}

// ── Background image ──────────────────────────────────────────────────────────

function bgPath(companyId: string, locationId?: string | null) {
  return locationId ? `${companyId}/${locationId}.jpg` : `${companyId}/main.jpg`
}

export async function getLotBackground(companyId: string, locationId?: string | null): Promise<string | null> {
  const supabase = createClient()
  const folder = locationId ? companyId : companyId
  const fileName = locationId ? `${locationId}.jpg` : 'main.jpg'
  const { data: files } = await supabase.storage.from('lot-backgrounds').list(folder)
  if (!files?.some(f => f.name === fileName)) return null
  const { data } = supabase.storage.from('lot-backgrounds').getPublicUrl(bgPath(companyId, locationId))
  return `${data.publicUrl}?t=${Date.now()}`
}

export async function uploadLotBackground(
  companyId: string,
  file: File,
  locationId?: string | null,
): Promise<string> {
  const supabase = createClient()
  const path = bgPath(companyId, locationId)
  await supabase.storage.from('lot-backgrounds').upload(path, file, { upsert: true, contentType: file.type })
  const { data } = supabase.storage.from('lot-backgrounds').getPublicUrl(path)
  return `${data.publicUrl}?t=${Date.now()}`
}

export async function removeLotBackground(companyId: string, locationId?: string | null): Promise<void> {
  const supabase = createClient()
  await supabase.storage.from('lot-backgrounds').remove([bgPath(companyId, locationId)])
}

// ── Shapes ────────────────────────────────────────────────────────────────────

export async function getLotShapes(companyId: string, locationId?: string | null): Promise<LotShape[]> {
  const supabase = createClient()
  let q = supabase.from('lot_shapes').select('*').eq('company_id', companyId).order('created_at')
  if (locationId) q = q.eq('location_id', locationId)
  else if (locationId === null) q = q.is('location_id', null)
  const { data } = await q
  return (data ?? []) as LotShape[]
}

export async function createLotShape(
  companyId: string,
  shape: Omit<LotShape, 'id' | 'company_id' | 'created_at'>,
): Promise<LotShape | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('lot_shapes')
    .insert({ company_id: companyId, ...shape })
    .select()
    .single()
  if (error) { console.error('[lot] createShape', error); return null }
  return data as LotShape
}

export async function updateLotShape(id: string, updates: Partial<Omit<LotShape, 'id' | 'company_id' | 'created_at'>>): Promise<void> {
  const supabase = createClient()
  await supabase.from('lot_shapes').update(updates).eq('id', id)
}

export async function deleteLotShape(id: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('lot_shapes').delete().eq('id', id)
}

// ── Occupancy ─────────────────────────────────────────────────────────────────

export async function getLotOccupancy(
  companyId: string,
  locationId?: string | null,
): Promise<{ total: number; occupied: number }> {
  const spots = await getLotSpots(companyId, locationId)
  return { total: spots.length, occupied: spots.filter(s => s.active_assignment).length }
}
