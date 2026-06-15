'use server'

import { createAdminClient } from './supabase/admin'

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
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
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
      const { error: vehicleErr } = await supabase
        .from('storage_vehicles')
        .insert({
          company_id: companyId,
          vin,
          year: resolvedYear,
          make: resolvedMake,
          model: resolvedModel,
          status: 'active',
          lifecycle_status: 'on_lot',
          arrived_at: new Date().toISOString(),
        })
      if (vehicleErr) console.error('[createDispatch] vehicle insert error', vehicleErr)
    }
  } catch (e) {
    console.error('[createDispatch] vehicle upsert error', e)
  }

  return { token, error: null }
}
