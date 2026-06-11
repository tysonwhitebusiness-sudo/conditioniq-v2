'use server'

import { createAdminClient } from './supabase/admin'

export async function fetchInspectionsByIds(ids: string[]) {
  if (!ids.length) return []
  const supabase = createAdminClient()
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
  const supabase = createAdminClient()
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
): Promise<void> {
  const supabase = createAdminClient()
  const { data: vehicle } = await supabase
    .from('storage_vehicles')
    .select('id, checkin_inspection_id, lifecycle_status, inspection_ids')
    .eq('company_id', companyId)
    .eq('vin', vin)
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

  if (inspectionType === 'check_in') {
    updates.checkin_inspection_id = inspectionId
    updates.status = 'inspected'
    if (!vehicle.lifecycle_status || ['queued', 'pending_arrival', 'in_progress'].includes(vehicle.lifecycle_status)) {
      updates.lifecycle_status = 'on_lot'
    }
  } else if (inspectionType === 'check_out') {
    updates.checkout_inspection_id = inspectionId
  } else {
    const cur = vehicle.lifecycle_status
    if (!cur || ['queued', 'pending_arrival', 'in_progress'].includes(cur)) {
      updates.lifecycle_status = 'one_off'
    }
  }

  const { error } = await supabase.from('storage_vehicles').update(updates).eq('id', vehicle.id)
  if (error) console.error('[lifecycle] update', error)
}

export async function getReportSignedUrlAction(storagePath: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from('inspection-reports')
    .createSignedUrl(storagePath, 3600)
  if (error) { console.error('[signedUrl]', error); return null }
  return data?.signedUrl ?? null
}

export async function saveReportUrlAction(inspectionId: string, reportUrl: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('vehicle_inspections')
    .update({ report_url: reportUrl, report_generated: true, report_generated_at: new Date().toISOString() })
    .eq('id', inspectionId)
  if (error) console.error('[saveReportUrl]', error)
}

export async function fetchInspectorNames(inspectorIds: string[]): Promise<Record<string, string>> {
  if (!inspectorIds.length) return {}
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('user_profiles')
    .select('id, full_name')
    .in('id', inspectorIds)
  const map: Record<string, string> = {}
  for (const p of data ?? []) map[p.id] = p.full_name ?? 'Unknown'
  return map
}
