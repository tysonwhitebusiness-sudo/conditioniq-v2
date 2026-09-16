'use server'

import { createAdminClient } from './supabase/admin'
import { logVehicleEvent } from './vehicle-events-actions'
import { authorizeCompanyAccess } from './inspection-auth'
import { toLegacyColumns, resolveVehicleMasterId } from './work-order-status'

// A dispatch link lives for 48 hours. Single source for the expiry so every
// "send a link" entry point in the app produces the same kind of link.
const DISPATCH_LINK_TTL_MS = 48 * 60 * 60 * 1000

export async function createDispatchAction({
  companyId,
  vin,
  year,
  make,
  model,
  notes,
  locationId,
}: {
  companyId: string
  vin: string
  year?: string | null
  make?: string | null
  model?: string | null
  notes?: string | null
  locationId?: string | null
}): Promise<{ token: string; error: string | null }> {
  const ok = await authorizeCompanyAccess(companyId)
  if (!ok) return { token: '', error: 'Not authorized' }

  const supabase = createAdminClient()
  const token = crypto.randomUUID()

  // 1. Create the dispatch record — this is the priority
  const { error: dispatchError } = await supabase
    .from('inspection_requests')
    .insert({
      company_id: companyId,
      vin,
      year: year || null,
      make: make || null,
      model: model || null,
      notes: notes?.trim() || null,
      location_id: locationId || null,
      token,
      status: 'pending',
      expires_at: new Date(Date.now() + DISPATCH_LINK_TTL_MS).toISOString(),
    })

  if (dispatchError) {
    return { token: '', error: dispatchError.message }
  }

  // 2. Add vehicle to inventory if not already present — failure does not block dispatch
  try {
    let resolvedYear = year ? (parseInt(year) || null) : null
    let resolvedMake = make || null
    let resolvedModel = model || null

    // Decode VIN server-side if year/make/model weren't available at dispatch time
    if (!resolvedYear || !resolvedMake || !resolvedModel) {
      const res = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${vin}?format=json`,
        { next: { revalidate: 86400 } },
      )
      if (res.ok) {
        const data = await res.json()
        const r = data.Results?.[0]
        if (r) {
          resolvedYear = resolvedYear ?? (parseInt(r.ModelYear) || null)
          resolvedMake = resolvedMake ?? (r.Make || null)
          resolvedModel = resolvedModel ?? (r.Model || null)
        }
      }
    }

    // Only insert if no vehicle with this VIN + company already exists
    const { data: existing } = await supabase
      .from('storage_vehicles')
      .select('id')
      .eq('company_id', companyId)
      .eq('vin', vin)
      .maybeSingle()

    if (!existing) {
      // vehicle_master_id is NOT NULL with no default. This insert previously
      // omitted it, so it failed on every dispatch for a VIN not already in
      // inventory — the link still sent, but the vehicle was never added.
      const yearText = resolvedYear ? String(resolvedYear) : null
      const vehicleMasterId = await resolveVehicleMasterId(supabase, companyId, vin, {
        year: yearText, make: resolvedMake, model: resolvedModel,
      })
      // A dispatched vehicle has not been inspected or checked in yet.
      const legacy = toLegacyColumns('pending_arrival')
      const { data: newVeh, error: vehicleErr } = await supabase
        .from('storage_vehicles')
        .insert({
          company_id: companyId,
          vehicle_master_id: vehicleMasterId,
          vin,
          year: yearText,
          make: resolvedMake,
          model: resolvedModel,
          work_order_status: 'pending_arrival',
          status: legacy.status,
          lifecycle_status: legacy.lifecycle_status,
          arrived_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (vehicleErr) console.error('[createDispatch] vehicle insert error', vehicleErr)
      if (newVeh) {
        logVehicleEvent({ companyId, vehicleId: newVeh.id, eventType: 'intake', description: 'Vehicle added to inventory', metadata: { source: 'dispatch', vin } })
      }
    }
  } catch (e) {
    console.error('[createDispatch] vehicle upsert error', e)
  }

  return { token, error: null }
}
