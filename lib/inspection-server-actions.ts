'use server'

import { createAdminClient } from './supabase/admin'

export async function fetchInspectionsByIds(ids: string[]) {
  if (!ids.length) return []
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('vehicle_inspections')
    .select('id, created_at, completed_at, status, usage_status, vehicle_score, inspection_type, inspector_id')
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
    .select('id, created_at, completed_at, status, usage_status, vehicle_score, inspection_type, inspector_id')
    .eq('company_id', companyId)
    .eq('vin', vin)
    .order('created_at', { ascending: false })
  if (error) console.error('[inspections] fetchByVin', error)
  return data ?? []
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
