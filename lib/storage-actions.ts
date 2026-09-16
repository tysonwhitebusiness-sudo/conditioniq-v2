import { createClient } from '@/lib/supabase/client'
import { logVehicleEvent } from '@/lib/vehicle-events-actions'
import { unassignVehicleFromSpot } from '@/lib/lot-actions'
import type { SpotSizeClass } from '@/lib/lot-actions'
import type { VehicleTemplate } from '@/lib/damage-actions'
import { type WorkOrderStatus, toLegacyColumns, resolveVehicleMasterId, updateWorkOrderStatus } from '@/lib/work-order-status'

export type InspectionType = 'standard' | 'check_in' | 'check_out'
// Legacy — kept only as the dual-write target type. work_order_status is authoritative.
export type StorageStatus = 'active' | 'pending_inspection' | 'inspected' | 'releasing' | 'released'

export interface StorageVehicle {
  id: string
  company_id: string
  location_id: string | null
  vehicle_master_id: string
  vin: string
  year: string | null
  make: string | null
  model: string | null
  status: StorageStatus
  work_order_status: WorkOrderStatus
  checkin_inspection_id: string | null
  checkout_inspection_id: string | null
  latest_inspection_id: string | null
  latest_score: number | null
  arrived_at: string
  released_at: string | null
  released_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
  location?: { id: string; name: string; city?: string; state?: string } | null
}

export interface StorageLocation {
  id: string
  name: string
  city?: string | null
  state?: string | null
  contact_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  active?: boolean
  address?: string | null
}

// ── Pre-select inspection type for a VIN ────────────────────────────────────

export async function inferInspectionType(
  companyId: string,
  vin: string
): Promise<InspectionType> {
  if (!companyId || !vin || vin.length !== 17) return 'standard'
  const supabase = createClient()
  const { data } = await supabase
    .from('storage_vehicles')
    .select('id, checkin_inspection_id')
    .eq('company_id', companyId)
    .eq('vin', vin)
    .neq('work_order_status', 'released')
    .maybeSingle()

  if (!data) return 'check_in'
  if (data.checkin_inspection_id) return 'check_out'
  return 'check_in'
}

// ── Stats ────────────────────────────────────────────────────────────────────

export async function getStorageStats(companyId: string) {
  const supabase = createClient()
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const [onLotRes, inspectedRes, uninspectedRes, releasedRes] = await Promise.all([
    supabase.from('storage_vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .not('work_order_status', 'in', '(pending_arrival,released)'),
    supabase.from('storage_vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .not('latest_inspection_id', 'is', null)
      .not('work_order_status', 'in', '(pending_arrival,released)'),
    supabase.from('storage_vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .is('latest_inspection_id', null)
      .not('work_order_status', 'in', '(pending_arrival,released)'),
    supabase.from('storage_vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('work_order_status', 'released')
      .gte('released_at', monthStart),
  ])

  return {
    onLot: onLotRes.count ?? 0,
    inspected: inspectedRes.count ?? 0,
    uninspected: uninspectedRes.count ?? 0,
    releasedThisMonth: releasedRes.count ?? 0,
  }
}

// ── Vehicles ─────────────────────────────────────────────────────────────────

export async function getStorageVehicles(
  companyId: string,
  filters?: { search?: string; status?: WorkOrderStatus; locationId?: string }
): Promise<StorageVehicle[]> {
  const supabase = createClient()
  let query = supabase
    .from('storage_vehicles')
    .select('*, location:location_id(id, name, city, state)')
    .eq('company_id', companyId)
    .order('arrived_at', { ascending: false })

  if (filters?.status) query = query.eq('work_order_status', filters.status)
  if (filters?.locationId) query = query.eq('location_id', filters.locationId)

  const { data, error } = await query
  if (error) throw error

  let vehicles = (data ?? []) as StorageVehicle[]
  if (filters?.search) {
    const s = filters.search.toLowerCase()
    vehicles = vehicles.filter(v =>
      v.vin?.toLowerCase().includes(s) ||
      v.make?.toLowerCase().includes(s) ||
      v.model?.toLowerCase().includes(s) ||
      v.year?.toLowerCase().includes(s)
    )
  }
  return vehicles
}

export async function getStorageVehicleById(id: string): Promise<StorageVehicle | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('storage_vehicles')
    .select('*, location:location_id(id, name, city, state)')
    .eq('id', id)
    .single()
  return data as StorageVehicle | null
}

export async function addStorageVehicle(payload: {
  companyId: string
  vin: string
  year?: string
  make?: string
  model?: string
  locationId?: string | null
  arrivedAt?: string
  notes?: string
}): Promise<StorageVehicle> {
  const supabase = createClient()
  const vin = payload.vin.trim()
  const vehicleMasterId = await resolveVehicleMasterId(supabase, payload.companyId, vin, {
    year: payload.year, make: payload.make, model: payload.model,
  })
  // arrived_at always defaults to now() here, so the vehicle has already
  // physically arrived — checked_in, not pending_arrival.
  const legacy = toLegacyColumns('checked_in')
  const { data, error } = await supabase
    .from('storage_vehicles')
    .insert({
      company_id: payload.companyId,
      vehicle_master_id: vehicleMasterId,
      vin,
      year: payload.year || null,
      make: payload.make || null,
      model: payload.model || null,
      location_id: payload.locationId || null,
      arrived_at: payload.arrivedAt || new Date().toISOString(),
      notes: payload.notes || null,
      work_order_status: 'checked_in',
      status: legacy.status,
      lifecycle_status: legacy.lifecycle_status,
    })
    .select('*, location:location_id(id, name, city, state)')
    .single()
  if (error) throw error
  return data as StorageVehicle
}

export async function updateStorageVehicle(id: string, updates: Partial<StorageVehicle>): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('storage_vehicles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteStorageVehicle(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('storage_vehicles').delete().eq('id', id)
  if (error) throw error
}

export async function bulkInsertVehicles(
  vehicles: Array<{ vin: string; year?: string; make?: string; model?: string; notes?: string; arrived_at?: string }>,
  companyId: string,
  locationId?: string | null
): Promise<{ inserted: number; skipped: string[] }> {
  const supabase = createClient()

  // Fetch existing open (non-released) VINs — released records don't block re-adds
  const { data: existing } = await supabase
    .from('storage_vehicles')
    .select('vin')
    .eq('company_id', companyId)
    .neq('work_order_status', 'released')

  const existingVins = new Set((existing ?? []).map(r => r.vin.toUpperCase()))
  const skipped: string[] = []
  const toInsert: any[] = []
  const legacy = toLegacyColumns('checked_in')

  for (const v of vehicles) {
    const vin = v.vin?.trim().toUpperCase()
    if (!vin) continue
    if (existingVins.has(vin)) { skipped.push(vin); continue }
    const vehicleMasterId = await resolveVehicleMasterId(supabase, companyId, vin, {
      year: v.year, make: v.make, model: v.model,
    })
    toInsert.push({
      company_id: companyId,
      vehicle_master_id: vehicleMasterId,
      vin,
      year: v.year || null,
      make: v.make || null,
      model: v.model || null,
      location_id: locationId || null,
      arrived_at: v.arrived_at || new Date().toISOString(),
      notes: v.notes || null,
      work_order_status: 'checked_in',
      status: legacy.status,
      lifecycle_status: legacy.lifecycle_status,
    })
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('storage_vehicles').insert(toInsert)
    if (error) throw error
  }
  return { inserted: toInsert.length, skipped }
}

// ── Inspection history for a VIN ─────────────────────────────────────────────

export async function getVehicleInspectionHistory(companyId: string, vin: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('vehicle_inspections')
    .select('id, created_at, status, vehicle_score, exterior_data, interior_data, engine_data, vehicle_function_data')
    .eq('company_id', companyId)
    .eq('vin', vin)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
  return data ?? []
}

// ── Locations (FMC) ──────────────────────────────────────────────────────────

export async function getStorageLocations(companyId: string): Promise<StorageLocation[]> {
  const supabase = createClient()
  // fmc_locations may use company_id or fmc_account_id depending on schema
  const { data } = await supabase
    .from('fmc_locations')
    .select('*')
    .or(`company_id.eq.${companyId},fmc_account_id.eq.${companyId}`)
    .order('name')
  return (data ?? []) as StorageLocation[]
}

export async function addStorageLocation(companyId: string, payload: {
  name: string
  address?: string
  city?: string
  state?: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
}): Promise<StorageLocation> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('fmc_locations')
    .insert({ company_id: companyId, fmc_account_id: companyId, ...payload, active: true })
    .select()
    .single()
  if (error) throw error
  return data as StorageLocation
}

export async function toggleLocationActive(id: string, active: boolean): Promise<void> {
  const supabase = createClient()
  await supabase.from('fmc_locations').update({ active }).eq('id', id)
}

// ── FMC Overview ─────────────────────────────────────────────────────────────

export async function getFMCOverviewStats(companyId: string) {
  const supabase = createClient()
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const [locsRes, totalRes, inspectedMonthRes, avgRes] = await Promise.all([
    supabase.from('fmc_locations')
      .select('id', { count: 'exact', head: true })
      .or(`company_id.eq.${companyId},fmc_account_id.eq.${companyId}`)
      .eq('active', true),
    supabase.from('storage_vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('status', ['active', 'inspected', 'releasing', 'pending_inspection']),
    supabase.from('vehicle_inspections')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'completed')
      .gte('created_at', monthStart),
    supabase.from('storage_vehicles')
      .select('latest_score')
      .eq('company_id', companyId)
      .not('latest_score', 'is', null),
  ])

  const scores = (avgRes.data ?? []).map((r: any) => r.latest_score).filter(Boolean)
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : null

  return {
    totalLocations: locsRes.count ?? 0,
    totalOnLot: totalRes.count ?? 0,
    inspectedThisMonth: inspectedMonthRes.count ?? 0,
    avgScore,
  }
}

export async function getFMCLocationSummaries(companyId: string) {
  const supabase = createClient()
  const { data: locations } = await supabase
    .from('fmc_locations')
    .select('*')
    .or(`company_id.eq.${companyId},fmc_account_id.eq.${companyId}`)
    .eq('active', true)
    .order('name')

  if (!locations?.length) return []

  const summaries = await Promise.all(
    locations.map(async (loc) => {
      const [totalRes, inspectedRes, avgRes] = await Promise.all([
        supabase.from('storage_vehicles')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('location_id', loc.id)
          .in('status', ['active', 'inspected', 'releasing', 'pending_inspection']),
        supabase.from('storage_vehicles')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('location_id', loc.id)
          .not('latest_inspection_id', 'is', null)
          .in('status', ['active', 'inspected', 'releasing', 'pending_inspection']),
        supabase.from('storage_vehicles')
          .select('latest_score')
          .eq('company_id', companyId)
          .eq('location_id', loc.id)
          .not('latest_score', 'is', null),
      ])
      const scores = (avgRes.data ?? []).map((r: any) => r.latest_score).filter(Boolean)
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : null
      const total = totalRes.count ?? 0
      const inspected = inspectedRes.count ?? 0
      return { ...loc, total, inspected, uninspected: total - inspected, avgScore }
    })
  )
  return summaries
}

// ── Lifecycle-aware vehicle management ───────────────────────────────────────

export async function getVehiclesForCompany(
  companyId: string,
  filters?: { status?: WorkOrderStatus; locationId?: string; search?: string }
) {
  const supabase = createClient()
  let query = supabase
    .from('storage_vehicles')
    .select(`
      *,
      location:location_id(id, name, city, state),
      checkin_inspection:checkin_inspection_id(id, vehicle_score, created_at, status),
      checkout_inspection:checkout_inspection_id(id, vehicle_score, created_at, status)
    `)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (filters?.status) {
    query = query.eq('work_order_status', filters.status)
  }
  if (filters?.locationId) {
    query = query.eq('location_id', filters.locationId)
  }
  if (filters?.search) {
    const s = `%${filters.search}%`
    query = query.or(`vin.ilike.${s},make.ilike.${s},model.ilike.${s}`)
  }
  return query
}

// Superseded by updateVehicleLifecycleStatusAction in inspection-server-actions.ts
// (the one actually wired to the wizard-completion flow). Kept as a thin wrapper
// around updateWorkOrderStatus for any future direct caller; no longer duplicates
// its own status-transition logic.
export async function updateVehicleLifecycleStatus(
  companyId: string,
  vin: string,
  inspectionId: string,
  inspectionType: InspectionType,
  score: number | null
): Promise<void> {
  const supabase = createClient()
  const { data: vehicle } = await supabase
    .from('storage_vehicles')
    .select('id, checkin_inspection_id, work_order_status, inspection_ids')
    .eq('company_id', companyId)
    .eq('vin', vin)
    .neq('work_order_status', 'released')
    .maybeSingle()

  if (!vehicle) return

  const updates: Record<string, any> = {
    latest_inspection_id: inspectionId,
    latest_score: score,
    updated_at: new Date().toISOString(),
  }

  const existingIds: string[] = vehicle.inspection_ids ?? []
  if (!existingIds.includes(inspectionId)) {
    updates.inspection_ids = [...existingIds, inspectionId]
  }

  let nextStatus: WorkOrderStatus | null = null

  if (inspectionType === 'check_in') {
    updates.checkin_inspection_id = inspectionId
    if (vehicle.work_order_status === 'pending_arrival') nextStatus = 'in_storage'
  } else if (inspectionType === 'check_out') {
    updates.checkout_inspection_id = inspectionId
    if (vehicle.work_order_status !== 'released') nextStatus = 'pending_release'
    if (vehicle.checkin_inspection_id && score !== null) {
      const { data: checkin } = await supabase
        .from('vehicle_inspections')
        .select('vehicle_score')
        .eq('id', vehicle.checkin_inspection_id)
        .single()
      if (checkin?.vehicle_score != null) {
        updates.condition_delta = score - checkin.vehicle_score
      }
    }
  } else if (vehicle.work_order_status === 'pending_arrival') {
    nextStatus = 'in_storage'
  }

  await supabase.from('storage_vehicles').update(updates).eq('id', vehicle.id)
  if (nextStatus) await updateWorkOrderStatus(vehicle.id, nextStatus)
}

export async function addVehicleToSystem(
  companyId: string,
  data: {
    vin?: string
    year?: string
    make?: string
    model?: string
    locationId?: string
    arrivedAt?: string
    notes?: string
    inspectionId?: string
    workOrderStatus?: WorkOrderStatus
    customerId?: string
    sizeClass?: SpotSizeClass
    vehicleTemplate?: VehicleTemplate
    bodyClass?: string
  }
): Promise<string | undefined> {
  const supabase = createClient()
  const vin = data.vin?.trim() || `UNKNOWN_${Date.now()}`

  const { data: existing } = await supabase
    .from('storage_vehicles')
    .select('id')
    .eq('company_id', companyId)
    .eq('vin', vin)
    .neq('work_order_status', 'released')
    .maybeSingle()

  if (existing) {
    const patch: Record<string, any> = { updated_at: new Date().toISOString() }
    if (data.year) patch.year = data.year
    if (data.make) patch.make = data.make
    if (data.model) patch.model = data.model
    if (data.locationId) patch.location_id = data.locationId
    await supabase.from('storage_vehicles').update(patch).eq('id', existing.id)
    return existing.id
  }

  const vehicleMasterId = await resolveVehicleMasterId(supabase, companyId, vin, {
    year: data.year, make: data.make, model: data.model,
    sizeClass: data.sizeClass, vehicleTemplate: data.vehicleTemplate,
    bodyClass: data.bodyClass,
  })
  const workOrderStatus = data.workOrderStatus ?? 'pending_arrival'
  const legacy = toLegacyColumns(workOrderStatus)

  const { data: inserted, error: insertError } = await supabase
    .from('storage_vehicles')
    .insert({
      company_id: companyId,
      vehicle_master_id: vehicleMasterId,
      vin,
      year: data.year || null,
      make: data.make || null,
      model: data.model || null,
      location_id: data.locationId || null,
      arrived_at: data.arrivedAt ?? new Date().toISOString(),
      notes: data.notes || null,
      work_order_status: workOrderStatus,
      status: legacy.status,
      lifecycle_status: legacy.lifecycle_status,
      latest_inspection_id: data.inspectionId || null,
      customer_id: data.customerId || null,
    })
    .select('id')
    .single()

  if (insertError) throw new Error(insertError.message)
  if (inserted) {
    logVehicleEvent({
      companyId, vehicleId: inserted.id, eventType: 'intake',
      description: 'Vehicle added to inventory',
      metadata: { source: 'manual', vin },
    })
  }
  return inserted?.id
}

export async function getVehiclesNeedingAttention(companyId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const supabase = createClient()
  const { data } = await supabase
    .from('storage_vehicles')
    .select('*, location:location_id(name)')
    .eq('company_id', companyId)
    .eq('work_order_status', 'checked_in')
    .is('latest_inspection_id', null)
    .lt('arrived_at', sevenDaysAgo)
    .order('arrived_at')
  return data ?? []
}

export async function releaseVehicle(vehicleId: string): Promise<void> {
  const supabase = createClient()
  const now = new Date()
  const legacy = toLegacyColumns('released')
  const { data, error } = await supabase.from('storage_vehicles').update({
    work_order_status: 'released',
    status: legacy.status,
    lifecycle_status: legacy.lifecycle_status,
    released_at: now.toISOString(),
    released_date: now.toISOString().split('T')[0],
    updated_at: now.toISOString(),
  }).eq('id', vehicleId).select('company_id').single()
  if (error) throw error
  if (data) {
    const { data: activeAssignment } = await supabase
      .from('lot_vehicle_assignments')
      .select('id')
      .eq('vehicle_id', vehicleId)
      .is('unassigned_at', null)
      .maybeSingle()
    if (activeAssignment) {
      await unassignVehicleFromSpot(activeAssignment.id)
    }
    logVehicleEvent({ companyId: data.company_id, vehicleId, eventType: 'released', description: 'Vehicle released from lot' })
  }
}

export async function markVehiclePendingPickup(vehicleId: string): Promise<void> {
  await updateWorkOrderStatus(vehicleId, 'pending_release')
}

export async function markVehicleOnLot(vehicleId: string): Promise<void> {
  await updateWorkOrderStatus(vehicleId, 'in_storage')
}
