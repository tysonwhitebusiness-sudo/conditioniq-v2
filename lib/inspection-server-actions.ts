'use server'

import { createClient } from './supabase/server'
import { createAdminClient } from './supabase/admin'

// ── DB helpers use the session-based server client (respects RLS for the
// authenticated user's own company — no service role key required).
// Storage helpers use the admin client (private bucket requires service role).

export async function fetchInspectionsByIds(ids: string[]) {
  if (!ids.length) return []
  const supabase = createClient()
  const { data, error } = await supabase
    .from('vehicle_inspections')
    .select('id, created_at, updated_at, status, usage_status, inspector_id, report_url, report_generated, report_generated_at')
    .in('id', ids)
    .order('created_at', { ascending: false })
  if (error) console.error('[inspections] fetchByIds', error)
  return data ?? []
}

export async function fetchInspectionsByVin(companyId: string, vin: string) {
  if (!companyId || !vin) return []
  const supabase = createClient()
  const { data, error } = await supabase
    .from('vehicle_inspections')
    .select('id, created_at, updated_at, status, usage_status, inspector_id, report_url, report_generated, report_generated_at')
    .eq('company_id', companyId)
    .eq('vin', vin)
    .order('created_at', { ascending: false })
  if (error) console.error('[inspections] fetchByVin', error)
  return data ?? []
}

export async function updateVehicleLifecycleStatusAction(
  companyId: string,
  vin: string,
  inspectionId: string,
  inspectionType: 'standard' | 'check_in' | 'check_out',
  score: number | null,
  vehicleDbId?: string,
): Promise<void> {
  const supabase = createClient()

  const { data: vehicle, error: findErr } = vehicleDbId
    ? await supabase
        .from('storage_vehicles')
        .select('id, checkin_inspection_id, lifecycle_status, inspection_ids')
        .eq('id', vehicleDbId)
        .maybeSingle()
    : await supabase
        .from('storage_vehicles')
        .select('id, checkin_inspection_id, lifecycle_status, inspection_ids')
        .eq('company_id', companyId)
        .eq('vin', vin)
        .maybeSingle()

  if (findErr) console.error('[lifecycle] find error', findErr)
  if (!vehicle) { console.error('[lifecycle] vehicle not found', { companyId, vin, vehicleDbId }); return }

  const updates: Record<string, any> = {
    latest_inspection_id: inspectionId,
    latest_score: score,
    updated_at: new Date().toISOString(),
  }

  const existingIds: string[] = vehicle.inspection_ids ?? []
  if (!existingIds.includes(inspectionId)) {
    updates.inspection_ids = [...existingIds, inspectionId]
  }

  if (inspectionType === 'check_in') {
    updates.checkin_inspection_id = inspectionId
    updates.status = 'inspected'
    if (!vehicle.lifecycle_status || ['queued', 'pending_arrival'].includes(vehicle.lifecycle_status)) {
      updates.lifecycle_status = 'on_lot'
    }
  } else if (inspectionType === 'check_out') {
    updates.checkout_inspection_id = inspectionId
    if (['on_lot'].includes(vehicle.lifecycle_status)) {
      updates.lifecycle_status = 'releasing'
    }
  } else {
    const cur = vehicle.lifecycle_status
    if (!cur || ['queued', 'pending_arrival'].includes(cur)) {
      updates.lifecycle_status = 'one_off'
    }
  }

  const { error } = await supabase.from('storage_vehicles').update(updates).eq('id', vehicle.id)
  if (error) console.error('[lifecycle] update error', error)
}

export async function saveReportUrlAction(inspectionId: string, reportUrl: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('vehicle_inspections')
    .update({ report_url: reportUrl, report_generated: true, report_generated_at: new Date().toISOString() })
    .eq('id', inspectionId)
  if (error) console.error('[saveReportUrl]', error)
}

export async function fetchFullInspectionAction(inspectionId: string): Promise<Record<string, any> | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('vehicle_inspections')
    .select('*')
    .eq('id', inspectionId)
    .single()
  if (error) { console.error('[fetchFullInspection]', error); return null }
  return data
}

export async function loadInspectionForResume(inspectionId: string): Promise<Record<string, any> | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('vehicle_inspections')
    .select('vehicleInfo, bol_data, keys_data, vehicle_function_data, documentation_data, exterior_data, interior_data, engine_data')
    .eq('id', inspectionId)
    .single()
  if (error) { console.error('[loadInspectionForResume]', error); return null }
  return data
}

export async function fetchInspectorNames(inspectorIds: string[]): Promise<Record<string, string>> {
  if (!inspectorIds.length) return {}
  const supabase = createClient()
  const { data } = await supabase
    .from('user_profiles')
    .select('id, full_name')
    .in('id', inspectorIds)
  const map: Record<string, string> = {}
  for (const p of data ?? []) map[p.id] = p.full_name ?? 'Unknown'
  return map
}

export async function getInspectionRequestByToken(token: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('inspection_requests')
    .select('id, company_id, vin, notes, token, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()
  return data ?? null
}

// ── Storage operations — require SUPABASE_SERVICE_ROLE_KEY in Vercel env vars

export async function createSignedUploadUrlAction(path: string): Promise<{ token: string; signedUrl: string } | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from('inspection-reports')
    .createSignedUploadUrl(path)
  if (error) { console.error('[signedUpload]', error); return null }
  return { token: data.token, signedUrl: data.signedUrl }
}

export async function getReportSignedUrlAction(storagePath: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from('inspection-reports')
    .createSignedUrl(storagePath, 3600)
  if (error) { console.error('[signedUrl]', error); return null }
  return data?.signedUrl ?? null
}
