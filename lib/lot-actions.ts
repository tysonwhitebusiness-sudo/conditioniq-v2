import { createClient } from '@/lib/supabase/client'
import { logVehicleEvent } from '@/lib/vehicle-events-actions'

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

export interface ZoneConfig   { x: number; y: number; width: number; height: number; rotation?: number }
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
  daily_rate: number | null
  monthly_rate: number | null
  billing_type: string | null
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

export function generateNextLabels(existing: string[], count: number): string[] {
  const used = new Set(existing)
  const result: string[] = []
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    for (let n = 1; n <= 20; n++) {
      if (result.length >= count) return result
      const label = `${letter}${n}`
      if (!used.has(label)) { used.add(label); result.push(label) }
    }
  }
  while (result.length < count) {
    const label = `Z${existing.length + result.length + 1}`
    result.push(label)
  }
  return result
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
      vehicle:storage_vehicles(id, vin, year, make, model, lifecycle_status, arrived_at, released_at, checkin_inspection_id, latest_score, daily_rate, monthly_rate, billing_type, latest_inspection_id)
    `)
    .in('spot_id', spots.map(s => s.id))
    .is('unassigned_at', null)

  const bySpot: Record<string, ActiveAssignment> = {}
  for (const a of (assignments ?? [])) bySpot[a.spot_id] = a as unknown as ActiveAssignment

  // Mark vehicles with an active inspection for the indicator overlay
  const latestInspIds = Object.values(bySpot)
    .map((a: any) => a.vehicle?.latest_inspection_id)
    .filter(Boolean)
  if (latestInspIds.length > 0) {
    const { data: activeInspections } = await supabase
      .from('vehicle_inspections')
      .select('id')
      .in('id', latestInspIds)
      .in('status', ['in_progress', 'started'])
    const activeIds = new Set((activeInspections ?? []).map((i: any) => i.id))
    for (const a of Object.values(bySpot) as any[]) {
      if (a.vehicle?.latest_inspection_id && activeIds.has(a.vehicle.latest_inspection_id)) {
        a.vehicle._inspecting = true
      }
    }
  }

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
  const [{ error }, { data: spot }] = await Promise.all([
    supabase.from('lot_vehicle_assignments').insert({ spot_id: spotId, vehicle_id: vehicleId, assigned_by: assignedBy }),
    supabase.from('lot_spots').select('label, company_id').eq('id', spotId).single(),
  ])
  if (!error && spot) {
    logVehicleEvent({
      companyId: spot.company_id, vehicleId, eventType: 'spot_assigned',
      description: `Assigned to ${spot.label}`,
      metadata: { spot_id: spotId }, createdBy: assignedBy,
    })
  }
}

export async function unassignVehicleFromSpot(assignmentId: string, unassignedBy?: string): Promise<void> {
  const supabase = createClient()
  const { data: assignment } = await supabase
    .from('lot_vehicle_assignments')
    .select('vehicle_id, spot:lot_spots(label, company_id)')
    .eq('id', assignmentId)
    .single()

  const { error } = await supabase
    .from('lot_vehicle_assignments')
    .update({ unassigned_at: new Date().toISOString() })
    .eq('id', assignmentId)

  if (!error && assignment) {
    const spot = assignment.spot as unknown as { label: string; company_id: string } | null
    if (spot) {
      logVehicleEvent({
        companyId: spot.company_id, vehicleId: assignment.vehicle_id, eventType: 'spot_unassigned',
        description: `Removed from ${spot.label}`, createdBy: unassignedBy ?? null,
      })
    }
  }
}

export async function getAvailableVehicles(companyId: string): Promise<AvailableVehicle[]> {
  const supabase = createClient()
  const { data: vehicles } = await supabase
    .from('storage_vehicles')
    .select('id, vin, year, make, model, lifecycle_status')
    .eq('company_id', companyId)
    .not('lifecycle_status', 'in', '(picked_up,completed)')
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

// ── Billing ───────────────────────────────────────────────────────────────────

export type BillingType = 'daily' | 'monthly'

export interface VehicleBillingResult {
  daysOnLot: number
  billingType: BillingType
  rate: number | null       // resolved rate (vehicle override or company default)
  accruedAmount: number | null
}

export function calculateVehicleBilling(
  vehicle: { arrived_at?: string | null; released_at?: string | null; billing_type?: string | null; daily_rate?: number | null; monthly_rate?: number | null },
  company: { default_billing_type?: string | null; default_daily_rate?: number | null; default_monthly_rate?: number | null },
): VehicleBillingResult {
  const start = vehicle.arrived_at ? new Date(vehicle.arrived_at) : null
  const end = vehicle.released_at ? new Date(vehicle.released_at) : new Date()
  const daysOnLot = start ? Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000)) : 0

  const billingType: BillingType =
    (vehicle.billing_type as BillingType) ??
    (company.default_billing_type as BillingType) ??
    'daily'

  const rate =
    billingType === 'daily'
      ? (vehicle.daily_rate ?? company.default_daily_rate ?? null)
      : (vehicle.monthly_rate ?? company.default_monthly_rate ?? null)

  let accruedAmount: number | null = null
  if (rate !== null) {
    accruedAmount = billingType === 'daily'
      ? daysOnLot * rate
      : (daysOnLot / 30) * rate
  }

  return { daysOnLot, billingType, rate, accruedAmount }
}

// ── Occupancy ─────────────────────────────────────────────────────────────────

export async function getLotOccupancy(
  companyId: string,
  locationId?: string | null,
): Promise<{ total: number; occupied: number }> {
  const spots = await getLotSpots(companyId, locationId)
  return { total: spots.length, occupied: spots.filter(s => s.active_assignment).length }
}

// ── Bulk Billing ──────────────────────────────────────────────────────────────

export interface BulkVehicleRow {
  vehicleId: string
  vin: string
  year: number | null
  make: string | null
  model: string | null
  arrivedAt: string | null
  releasedAt: string | null
  billingType: BillingType
  rate: number | null
  effectiveStart: string    // YYYY-MM-DD
  effectiveEnd: string      // YYYY-MM-DD
  days: number
  subtotal: number | null
  warning: 'arrived_late' | null   // arrived after range start — yellow, must acknowledge
  note: 'released_early' | null    // released before range end — gray
  excluded: boolean                 // not on lot during range at all — red
}

function toUtcDay(isoStr: string): Date {
  const d = new Date(isoStr)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export function calculateBulkBilling(
  vehicles: Array<{
    id: string
    vin: string
    year?: number | null
    make?: string | null
    model?: string | null
    arrived_at?: string | null
    released_at?: string | null
    billing_type?: string | null
    daily_rate?: number | null
    monthly_rate?: number | null
  }>,
  rangeStart: string,   // YYYY-MM-DD
  rangeEnd: string,     // YYYY-MM-DD
  company: {
    default_billing_type?: string | null
    default_daily_rate?: number | null
    default_monthly_rate?: number | null
  },
): BulkVehicleRow[] {
  const rStart = toUtcDay(rangeStart)
  const rEnd   = toUtcDay(rangeEnd)

  return vehicles.map(v => {
    const arrivedAt  = v.arrived_at  ? toUtcDay(v.arrived_at)  : null
    const releasedAt = v.released_at ? toUtcDay(v.released_at) : null

    // Exclude: no arrived_at, arrived after range ends, or released before range starts
    const excluded =
      arrivedAt === null ||
      arrivedAt > rEnd ||
      (releasedAt !== null && releasedAt < rStart)

    const effStart = arrivedAt && arrivedAt > rStart ? arrivedAt : rStart
    const effEnd   = releasedAt && releasedAt < rEnd ? releasedAt : rEnd

    // days inclusive of both endpoints (spec: end-start+1)
    const days = excluded ? 0 : Math.max(0, Math.floor((effEnd.getTime() - effStart.getTime()) / 86400000) + 1)

    const warning: 'arrived_late' | null = !excluded && arrivedAt && arrivedAt > rStart ? 'arrived_late' : null
    const note: 'released_early' | null  = !excluded && releasedAt && releasedAt < rEnd ? 'released_early' : null

    const billingType: BillingType =
      (v.billing_type as BillingType) ??
      (company.default_billing_type as BillingType) ??
      'daily'

    const rate =
      billingType === 'daily'
        ? (v.daily_rate ?? company.default_daily_rate ?? null)
        : (v.monthly_rate ?? company.default_monthly_rate ?? null)

    let subtotal: number | null = null
    if (!excluded && rate !== null) {
      subtotal = billingType === 'daily' ? days * rate : (days / 30) * rate
    }

    return {
      vehicleId: v.id,
      vin: v.vin,
      year: v.year ?? null,
      make: v.make ?? null,
      model: v.model ?? null,
      arrivedAt: v.arrived_at ?? null,
      releasedAt: v.released_at ?? null,
      billingType,
      rate,
      effectiveStart: effStart.toISOString().slice(0, 10),
      effectiveEnd:   effEnd.toISOString().slice(0, 10),
      days,
      subtotal,
      warning,
      note,
      excluded,
    }
  })
}
