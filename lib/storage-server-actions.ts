'use server'

import { logVehicleEvent } from '@/lib/vehicle-events-actions'
import { authorizeCompanyAccess } from './inspection-auth'
import { createAdminClient } from './supabase/admin'
import type { InspectionType } from './storage-actions'

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

  const { data: existing } = await supabase
    .from('storage_vehicles')
    .select('id, checkin_inspection_id, checkout_inspection_id, status, year, make, model')
    .eq('company_id', companyId)
    .eq('vin', vinKey)
    .neq('lifecycle_status', 'completed')
    .maybeSingle()

  const now = new Date().toISOString()
  const isInitiation = score === null

  if (existing) {
    const updates: Record<string, any> = {
      updated_at: now,
      year: year || existing.year,
      make: make || existing.make,
      model: model || existing.model,
    }
    if (isInitiation) {
      if (existing.status === 'active') updates.status = 'pending_inspection'
    } else {
      updates.latest_inspection_id = inspectionId
      updates.latest_score = score
      if (inspectionType === 'check_in') {
        updates.checkin_inspection_id = inspectionId
        updates.status = 'inspected'
        updates.arrived_at = now
      } else if (inspectionType === 'check_out') {
        updates.checkout_inspection_id = inspectionId
      }
    }
    await supabase.from('storage_vehicles').update(updates).eq('id', existing.id)
    return existing.id
  } else {
    const insert: Record<string, any> = {
      company_id: companyId,
      location_id: locationId,
      vin: vinKey,
      year,
      make,
      model,
      status: isInitiation ? 'pending_inspection' : 'active',
      arrived_at: now,
    }
    if (!isInitiation) {
      insert.latest_inspection_id = inspectionId
      insert.latest_score = score
      if (inspectionType === 'check_in') {
        insert.checkin_inspection_id = inspectionId
        insert.status = 'inspected'
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
