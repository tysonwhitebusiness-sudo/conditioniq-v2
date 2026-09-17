import { getPlan } from '@/lib/pricing'
import { logVehicleEvent } from '@/lib/vehicle-events-actions'
import { toLegacyColumns, resolveVehicleMasterId } from '@/lib/work-order-status'

// The vehicle an inspection is about, resolved when the inspection starts.
//
// Damage pins are saved against a vehicle record, so a full inspection needs
// its vehicle before it opens. Previously the vehicle was only created when the
// inspection finished (or, when a VIN was known up front, in a background write
// nobody waited for), so there was nothing to pin damage to. Every start path
// now goes through here and waits for the result.
//
// Server-side only: callers pass the admin client after authorizing.

export interface InspectionVehicleInput {
  companyId: string
  inspectionId: string
  // A vehicle already in inventory, picked from the list.
  vehicleId?: string | null
  // Or a VIN: an active visit for it is reused, otherwise one is created.
  vin?: string | null
  year?: string | number | null
  make?: string | null
  model?: string | null
  bodyClass?: string | null
}

export async function attachInspectionVehicle(supabase: any, input: InspectionVehicleInput): Promise<string | null> {
  const { companyId, inspectionId } = input
  const now = new Date().toISOString()
  let vehicleId: string | null = null

  if (input.vehicleId) {
    const { data: picked, error } = await supabase
      .from('storage_vehicles')
      .select('id, work_order_status')
      .eq('id', input.vehicleId)
      .eq('company_id', companyId)
      .maybeSingle()
    if (error) throw error
    if (!picked) throw new Error('That vehicle is not in this account')
    await touchVehicle(supabase, picked, inspectionId, now)
    vehicleId = picked.id
  } else {
    const vin = input.vin?.trim().toUpperCase()
    if (!vin) return null
    const { data: active, error } = await supabase
      .from('storage_vehicles')
      .select('id, work_order_status')
      .eq('company_id', companyId)
      .eq('vin', vin)
      .neq('work_order_status', 'released')
      .maybeSingle()
    if (error) throw error
    const year = input.year != null && input.year !== '' ? String(input.year) : null
    if (active) {
      await touchVehicle(supabase, active, inspectionId, now)
      // Fill in a body type the earlier visit never had.
      if (input.bodyClass) await resolveVehicleMasterId(supabase, companyId, vin, { year, make: input.make, model: input.model, bodyClass: input.bodyClass })
      vehicleId = active.id
    } else {
      const vehicleMasterId = await resolveVehicleMasterId(supabase, companyId, vin, {
        year, make: input.make ?? null, model: input.model ?? null, bodyClass: input.bodyClass ?? null,
      })
      const legacy = toLegacyColumns('checked_in')
      const { data: created, error: insertErr } = await supabase
        .from('storage_vehicles')
        .insert({
          company_id: companyId, vehicle_master_id: vehicleMasterId, vin,
          year, make: input.make ?? null, model: input.model ?? null,
          work_order_status: 'checked_in', status: legacy.status, lifecycle_status: legacy.lifecycle_status,
          arrived_at: now, latest_inspection_id: inspectionId,
        })
        .select('id')
        .single()
      if (insertErr) throw insertErr
      vehicleId = created.id
      logVehicleEvent({
        companyId, vehicleId: created.id, eventType: 'intake', description: 'Vehicle added to inventory',
        metadata: { source: 'inspection_start', inspection_id: inspectionId, vin },
      })
    }
  }

  const { error: linkErr } = await supabase
    .from('vehicle_inspections')
    .update({ vehicle_id: vehicleId })
    .eq('id', inspectionId)
  if (linkErr) throw linkErr
  return vehicleId
}

async function touchVehicle(supabase: any, vehicle: { id: string; work_order_status: string }, inspectionId: string, now: string) {
  const patch: Record<string, unknown> = { latest_inspection_id: inspectionId, updated_at: now }
  if (vehicle.work_order_status === 'pending_arrival') {
    const legacy = toLegacyColumns('checked_in')
    patch.work_order_status = 'checked_in'
    patch.status = legacy.status
    patch.lifecycle_status = legacy.lifecycle_status
  }
  const { error } = await supabase.from('storage_vehicles').update(patch).eq('id', vehicle.id)
  if (error) throw error
}

// Inspection-only accounts (Pay Per Use) have no lot, so a vehicle record exists
// only to carry the inspection and its damage pins. Once the inspection ends,
// completed, cancelled or abandoned, the record is closed out as released so it
// never looks like a unit on a lot. Accounts with the lot platform are left
// alone: their vehicles move through the normal work order statuses.
export async function releaseInspectionOnlyVehicles(supabase: any, inspectionIds: string[]): Promise<void> {
  if (inspectionIds.length === 0) return
  const { data: rows, error } = await supabase
    .from('vehicle_inspections')
    .select('vehicle_id, company_id')
    .in('id', inspectionIds)
    .not('vehicle_id', 'is', null)
  if (error) throw error
  if (!rows?.length) return

  const companyIds = Array.from(new Set(rows.map((r: { company_id: string }) => r.company_id)))
  const { data: companies, error: companyErr } = await supabase
    .from('companies')
    .select('id, subscription_tier')
    .in('id', companyIds)
  if (companyErr) throw companyErr
  const inspectionOnly = new Set(
    (companies ?? []).filter((c: { subscription_tier: string }) => !getPlan(c.subscription_tier).hasPlatform).map((c: { id: string }) => c.id),
  )

  const vehicleIds = rows.filter((r: { company_id: string }) => inspectionOnly.has(r.company_id)).map((r: { vehicle_id: string }) => r.vehicle_id)
  if (vehicleIds.length === 0) return

  const now = new Date().toISOString()
  const legacy = toLegacyColumns('released')
  const { error: releaseErr } = await supabase
    .from('storage_vehicles')
    .update({
      work_order_status: 'released', status: legacy.status, lifecycle_status: legacy.lifecycle_status,
      released_at: now, released_date: now.split('T')[0], updated_at: now,
    })
    .in('id', vehicleIds)
    .neq('work_order_status', 'released')
  if (releaseErr) throw releaseErr
}
