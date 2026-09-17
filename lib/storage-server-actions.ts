'use server'

import { logVehicleEvent } from '@/lib/vehicle-events-actions'
import { authorizeCompanyAccess } from './inspection-auth'
import { createAdminClient } from './supabase/admin'
import type { InspectionType } from './storage-actions'
import { type WorkOrderStatus, toLegacyColumns, resolveVehicleMasterId } from './work-order-status'

// ── Upsert on inspection completion ─────────────────────────────────────────

export async function upsertVehicleToInventory(
  inspectionId: string,
  companyId: string,
  inspectionData: Record<string, any>,
  scoreResult: any,
  inspectionType: InspectionType
): Promise<string | undefined> {
  if (!companyId) return undefined

  const ok = await authorizeCompanyAccess(companyId)
  if (!ok) return undefined

  const supabase = createAdminClient()

  const vin = (inspectionData.vehicleInfo?.vin ?? inspectionData.vin ?? '').trim()
  const year = inspectionData.vehicleInfo?.year ?? inspectionData.year ?? null
  const make = inspectionData.vehicleInfo?.make ?? inspectionData.make ?? null
  const model = inspectionData.vehicleInfo?.model ?? inspectionData.model ?? null
  const score = scoreResult?.score ?? null
  const locationId = inspectionData.vehicleInfo?.locationId ?? null
  const vinKey = vin || `UNKNOWN_${Date.now()}`

  const VEHICLE_SELECT = 'id, checkin_inspection_id, checkout_inspection_id, work_order_status, year, make, model'
  // An inspection started from a vehicle carries it; use that record rather than
  // matching by VIN, which would miss a released inspection-only record and
  // create a duplicate visit.
  const { data: linked } = await supabase
    .from('vehicle_inspections')
    .select('vehicle_id')
    .eq('id', inspectionId)
    .maybeSingle()
  const { data: existing } = linked?.vehicle_id
    ? await supabase.from('storage_vehicles').select(VEHICLE_SELECT).eq('id', linked.vehicle_id).eq('company_id', companyId).maybeSingle()
    : await supabase.from('storage_vehicles').select(VEHICLE_SELECT).eq('company_id', companyId).eq('vin', vinKey).neq('work_order_status', 'released').maybeSingle()

  const now = new Date().toISOString()
  const isInitiation = score === null

  // Already closed out (an inspection-only account's record, released when the
  // inspection completed): record the result, never reopen it.
  if (existing && existing.work_order_status === 'released') {
    await supabase.from('storage_vehicles').update({
      updated_at: now,
      year: year || existing.year, make: make || existing.make, model: model || existing.model,
      ...(isInitiation ? {} : { latest_inspection_id: inspectionId, latest_score: score }),
    }).eq('id', existing.id)
    return existing.id
  }

  if (existing) {
    const updates: Record<string, any> = {
      updated_at: now,
      year: year || existing.year,
      make: make || existing.make,
      model: model || existing.model,
    }
    let nextStatus: WorkOrderStatus | null = null
    if (isInitiation) {
      // Only advance from the base pending_arrival state — an inspection
      // starting on a vehicle already checked_in/in_storage/etc. shouldn't
      // regress or skip its more specific status (matches the old code's
      // narrow `existing.status === 'active'` guard).
      if (existing.work_order_status === 'pending_arrival') nextStatus = 'checked_in'
    } else {
      updates.latest_inspection_id = inspectionId
      updates.latest_score = score
      if (inspectionType === 'check_in') {
        updates.checkin_inspection_id = inspectionId
        updates.arrived_at = now
        nextStatus = 'in_storage'
      } else if (inspectionType === 'check_out') {
        updates.checkout_inspection_id = inspectionId
        // Preserving existing behavior: this flow does not auto-advance
        // status on checkout (that only happens via the separate
        // updateVehicleLifecycleStatusAction path used when the wizard is
        // launched from the vehicle detail page).
      }
    }
    if (nextStatus) {
      const legacy = toLegacyColumns(nextStatus)
      updates.work_order_status = nextStatus
      updates.status = legacy.status
      updates.lifecycle_status = legacy.lifecycle_status
    }
    await supabase.from('storage_vehicles').update(updates).eq('id', existing.id)
    return existing.id
  } else {
    const vehicleMasterId = await resolveVehicleMasterId(supabase, companyId, vinKey, { year, make, model })
    const initialStatus: WorkOrderStatus = isInitiation ? 'checked_in' : (inspectionType === 'check_in' ? 'in_storage' : 'checked_in')
    const legacy = toLegacyColumns(initialStatus)
    const insert: Record<string, any> = {
      company_id: companyId,
      vehicle_master_id: vehicleMasterId,
      location_id: locationId,
      vin: vinKey,
      year,
      make,
      model,
      work_order_status: initialStatus,
      status: legacy.status,
      lifecycle_status: legacy.lifecycle_status,
      arrived_at: now,
    }
    if (!isInitiation) {
      insert.latest_inspection_id = inspectionId
      insert.latest_score = score
      if (inspectionType === 'check_in') {
        insert.checkin_inspection_id = inspectionId
      } else if (inspectionType === 'check_out') {
        insert.checkout_inspection_id = inspectionId
      }
    }
    const { data: created } = await supabase.from('storage_vehicles').insert(insert).select('id').single()
    if (created) {
      logVehicleEvent({
        companyId, vehicleId: created.id, eventType: 'intake',
        description: 'Vehicle added to inventory',
        metadata: { source: 'inspection', inspection_id: inspectionId, vin: vinKey },
      })
    }
    return created?.id
  }
}
