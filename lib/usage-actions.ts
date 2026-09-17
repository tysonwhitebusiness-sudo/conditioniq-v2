'use server'

import { createClient } from '@/lib/supabase/server'
import { captureHighSeverityError } from '@/lib/sentry'
import { logVehicleEvent } from '@/lib/vehicle-events-actions'
import { authorizeInspectionAccess } from './inspection-auth'
import { attachInspectionVehicle, releaseInspectionOnlyVehicles } from './inspection-vehicle'
import { computeUsageState, type UsageState } from './usage-state'

export type { UsageState } from './usage-state'

export async function checkUsageState(companyId: string): Promise<UsageState> {
  return computeUsageState(createClient(), companyId)
}

// Records whether a just-completed inspection falls into overage. Usage is
// derived from generated reports, so nothing is incremented: completing the same
// inspection twice can no longer count it twice, and concurrent completions can
// no longer lose a count.
async function stampOverage(supabase: any, companyId: string, inspectionId: string): Promise<void> {
  const usage = await computeUsageState(supabase, companyId)
  const { error } = await supabase
    .from('vehicle_inspections')
    .update({ is_overage: usage.isOverage })
    .eq('id', inspectionId)
  if (error) throw error
}

// Only the call that actually moves an inspection to completed goes on to record
// usage. A retry or duplicate call matches no row and stops. Rows written before
// usage_status existed have it null, which the filter must still match.
const NOT_YET_COMPLETED = 'usage_status.is.null,usage_status.neq.completed'

export async function checkExistingInspection(
  companyId: string,
  vin: string
): Promise<{ inspectionId: string; startedAt: string } | null> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('vehicle_inspections')
    .select('id, initiated_at')
    .eq('company_id', companyId)
    .eq('vin', vin.trim().toUpperCase())
    .eq('status', 'in_progress')
    .order('initiated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return { inspectionId: data.id, startedAt: data.initiated_at }
}

export async function initiateInspection({
  companyId,
  inspectorId,
  initialData,
  deviceId,
  vehicleId,
  bodyClass,
}: {
  companyId: string
  inspectorId: string
  initialData?: Record<string, any>
  deviceId?: string
  // A vehicle picked from inventory. Without it, initialData.vin is used.
  vehicleId?: string
  // VIN-decoded body class, so a new vehicle gets its body type for the damage picker.
  bodyClass?: string
}): Promise<{ inspectionId: string; vehicleId: string | null; isOverage: boolean }> {
  const supabase = createClient()

  const usageState = await computeUsageState(supabase, companyId)
  // An ended demo cannot start new inspections. Enforced here, not only in the
  // UI, so no entry point can bypass it.
  if (usageState.blockReason) throw new Error(usageState.blockReason)
  const isOverage = usageState.isOverage
  const now = new Date().toISOString()

  const { data: inspection, error } = await supabase
    .from('vehicle_inspections')
    .insert({
      company_id: companyId,
      inspector_id: inspectorId,
      status: 'in_progress',
      usage_status: 'initiated',
      initiated_at: now,
      last_active_at: now,
      is_overage: false,
      device_id: deviceId ?? null,
      ...(initialData ?? {}),
    })
    .select('id')
    .single()

  if (error || !inspection) throw new Error(error?.message ?? 'Failed to create inspection')

  // The vehicle is resolved before the inspection opens and the start waits for
  // it: the damage picker pins to this vehicle. If it cannot be resolved, the
  // just-created inspection is removed rather than left without its vehicle.
  let resolvedVehicleId: string | null = null
  if (vehicleId || initialData?.vin) {
    try {
      resolvedVehicleId = await attachInspectionVehicle(supabase, {
        companyId, inspectionId: inspection.id, vehicleId,
        vin: initialData?.vin, year: initialData?.year, make: initialData?.make, model: initialData?.model,
        bodyClass,
      })
    } catch (e: any) {
      await supabase.from('vehicle_inspections').delete().eq('id', inspection.id)
      captureHighSeverityError(e, { flow: 'initiateInspection.attachVehicle', companyId })
      throw new Error('Could not set up the vehicle for this inspection: ' + (e?.message ?? 'unknown error'))
    }
  }

  return { inspectionId: inspection.id, vehicleId: resolvedVehicleId, isOverage }
}

export async function completeInspection(inspectionId: string, score?: number | null): Promise<void> {
  const { ok, companyId } = await authorizeInspectionAccess(inspectionId)
  if (!ok) throw new Error('Not authorized to complete this inspection')

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()
  try {
    const updates: Record<string, any> = { usage_status: 'completed', status: 'completed' }
    if (score !== undefined) updates.vehicle_score = score

    const { data: transitioned, error: updateError } = await supabase
      .from('vehicle_inspections')
      .update(updates)
      .eq('id', inspectionId)
      .or(NOT_YET_COMPLETED)
      .select('id')

    if (updateError) throw updateError
    if (!transitioned?.length) return

    if (companyId) await stampOverage(supabase, companyId, inspectionId)
    await releaseInspectionOnlyVehicles(supabase, [inspectionId])
  } catch (err) {
    captureHighSeverityError(err, { flow: 'completeInspection', inspectionId })
    throw err
  }
}

export async function abandonInspection(inspectionId: string): Promise<void> {
  const { ok } = await authorizeInspectionAccess(inspectionId)
  if (!ok) throw new Error('Not authorized to abandon this inspection')

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()
  await supabase
    .from('vehicle_inspections')
    .update({ usage_status: 'abandoned', status: 'abandoned' })
    .eq('id', inspectionId)
  await releaseInspectionOnlyVehicles(supabase, [inspectionId])
    .catch(e => captureHighSeverityError(e, { flow: 'abandonInspection.release', inspectionId }))
}

export async function getFMCRequestByToken(token: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('fmc_inspection_requests')
    .select(`*, fmc_locations(name, city, state)`)
    .eq('link_token', token)
    .single()

  if (error) return null

  if (data.link_expires_at && new Date(data.link_expires_at) < new Date()) return null

  return data
}

export async function trackFMCLinkOpened(token: string): Promise<void> {
  const supabase = createClient()
  await supabase
    .from('fmc_inspection_requests')
    .update({ status: 'link_opened', link_opened_at: new Date().toISOString() })
    .eq('link_token', token)
    .eq('status', 'pending')
}

export async function initiateFMCInspection({
  token,
  companyId,
  requestId,
  vin,
}: {
  token: string
  companyId: string
  requestId: string
  vin: string
}): Promise<{ inspectionId: string }> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()

  const blockReason = (await computeUsageState(supabase, companyId)).blockReason
  if (blockReason) throw new Error(blockReason)

  const { data: inspection, error } = await supabase
    .from('vehicle_inspections')
    .insert({
      company_id: companyId,
      status: 'in_progress',
      usage_status: 'initiated',
      initiated_at: new Date().toISOString(),
      is_overage: false,
      vin,
    })
    .select('id')
    .single()

  if (error || !inspection) throw new Error(error?.message ?? 'Failed to create FMC inspection')

  await supabase
    .from('fmc_inspection_requests')
    .update({ status: 'in_progress', inspection_started_at: new Date().toISOString(), report_id: inspection.id })
    .eq('id', requestId)

  return { inspectionId: inspection.id }
}

export async function completeFMCInspection({
  inspectionId,
  requestId,
  fmcAccountId,
  vin,
}: {
  inspectionId: string
  requestId: string
  fmcAccountId: string
  vin: string
}): Promise<void> {
  const { ok, companyId } = await authorizeInspectionAccess(inspectionId)
  if (!ok) throw new Error('Not authorized to complete this inspection')

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const [{ data: transitioned }] = await Promise.all([
    supabase
      .from('vehicle_inspections')
      .update({ usage_status: 'completed', status: 'completed' })
      .eq('id', inspectionId)
      .or(NOT_YET_COMPLETED)
      .select('id'),
    supabase
      .from('fmc_inspection_requests')
      .update({ status: 'completed' })
      .eq('id', requestId),
  ])

  if (companyId && transitioned?.length) {
    try {
      await stampOverage(supabase, companyId, inspectionId)
    } catch (err) {
      captureHighSeverityError(err, { flow: 'completeFMCInspection', inspectionId })
      throw err
    }
  }

  const { data: existing } = await supabase
    .from('fmc_vehicle_inventory')
    .select('id')
    .eq('fmc_account_id', fmcAccountId)
    .eq('vin', vin)
    .single()

  if (existing) {
    await supabase
      .from('fmc_vehicle_inventory')
      .update({ status: 'inspected', latest_report_id: inspectionId, updated_at: now })
      .eq('id', existing.id)
  } else {
    await supabase.from('fmc_vehicle_inventory').insert({
      fmc_account_id: fmcAccountId,
      vin,
      status: 'inspected',
      latest_report_id: inspectionId,
    })
  }
}

export async function initiateInspectionRequest({
  requestId,
  companyId,
  vin,
}: {
  requestId: string
  companyId: string
  vin?: string
}): Promise<{ inspectionId: string; error: null } | { inspectionId: null; error: string }> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // The remote inspector is not signed in, so the page cannot check this for
    // itself; the admin client can.
    // The person holding this link does not own the account, so they get their
    // own wording rather than the owner's "upgrade your plan" message.
    const blockReason = (await computeUsageState(supabase, companyId)).blockReason
    if (blockReason) {
      return {
        inspectionId: null,
        error: 'This link cannot start a new inspection right now. Contact the company that sent it.',
      }
    }

    const { data: inspection, error } = await supabase
      .from('vehicle_inspections')
      .insert({
        company_id: companyId,
        status: 'in_progress',
        usage_status: 'initiated',
        initiated_at: new Date().toISOString(),
        is_overage: false,
        ...(vin ? { vin } : {}),
      })
      .select('id')
      .single()

    if (error || !inspection) {
      console.error('[initiateInspectionRequest] insert error', error)
      return { inspectionId: null, error: error?.message ?? 'Failed to create inspection' }
    }

    const vinKey = vin?.trim() || null

    await supabase
      .from('inspection_requests')
      .update({ used_at: new Date().toISOString(), report_id: inspection.id })
      .eq('id', requestId)

    // Mirrors the storage sync in initiateInspection above. This path was missed
    // when vehicle_master shipped: it wrote only the legacy status column (so the
    // vehicle's work_order_status never moved), matched released visits too (so
    // maybeSingle errored for any VIN seen before), and inserted without the
    // NOT NULL vehicle_master_id — a failure the swallowed promise hid.
    // Same vehicle resolution as a signed-in start. A link without a VIN gets its
    // vehicle once the inspector enters one (attachInspectionVehicleByVin).
    if (vinKey) {
      try {
        await attachInspectionVehicle(supabase, { companyId, inspectionId: inspection.id, vin: vinKey })
      } catch (e) {
        // A remote inspector is never blocked from starting; the damage step
        // retries the attach once the VIN is confirmed.
        captureHighSeverityError(e, { flow: 'initiateInspectionRequest.attachVehicle', companyId })
      }
    }

    return { inspectionId: inspection.id, error: null }
  } catch (e: any) {
    console.error('[initiateInspectionRequest] unexpected error', e)
    return { inspectionId: null, error: e?.message ?? 'Unknown error starting inspection' }
  }
}

export async function createShareToken(inspectionId: string): Promise<string> {
  const supabase = createClient()
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase.from('inspection_share_tokens').insert({
    inspection_id: inspectionId,
    token,
    expires_at: expiresAt,
  })

  if (error) throw new Error('Failed to create share token')
  return token
}

export async function createInspectionRequest(
  companyId: string,
  vehicleInfo: { vin?: string; year?: string; make?: string; model?: string; location?: string; notes?: string },
  expiresInHours = 24
): Promise<string> {
  const supabase = createClient()
  const token = crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36)
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()

  const { error } = await supabase.from('inspection_requests').insert({
    company_id: companyId,
    token,
    expires_at: expiresAt,
    ...vehicleInfo,
  })

  if (error) throw new Error('Failed to create inspection request')
  return token
}
