'use server'

import { createClient } from '@/lib/supabase/server'

export async function getFMCLocations(fmcAccountId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('fmc_locations')
    .select('*')
    .eq('fmc_account_id', fmcAccountId)
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function upsertFMCLocation(location: Record<string, any>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('fmc_locations')
    .upsert({ ...location, updated_at: new Date().toISOString() })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function toggleFMCLocation(id: string, active: boolean) {
  const supabase = createClient()
  await supabase.from('fmc_locations').update({ active, updated_at: new Date().toISOString() }).eq('id', id)
}

export async function getFMCInspectionRequests(fmcAccountId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('fmc_inspection_requests')
    .select(`*, fmc_locations(name, city, state)`)
    .eq('fmc_account_id', fmcAccountId)
    .not('status', 'eq', 'expired')
    .order('dispatched_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createFMCDispatchLink({
  fmcAccountId,
  locationId,
  vin,
  notes,
  expiresInDays = 7,
}: {
  fmcAccountId: string
  locationId?: string
  vin?: string
  notes?: string
  expiresInDays?: number
}) {
  const supabase = createClient()
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('fmc_inspection_requests')
    .insert({
      fmc_account_id: fmcAccountId,
      location_id: locationId ?? null,
      vin: vin ?? null,
      notes: notes ?? null,
      status: 'pending',
      link_expires_at: expiresAt,
    })
    .select('link_token')
    .single()

  if (error) throw error
  return data.link_token
}

export async function getFMCInventory(fmcAccountId: string, filters?: { locationId?: string; status?: string; search?: string }) {
  const supabase = createClient()
  let q = supabase
    .from('fmc_vehicle_inventory')
    .select(`*, fmc_locations(name), vehicle_inspections(vehicle_score, completed_at)`)
    .eq('fmc_account_id', fmcAccountId)

  if (filters?.locationId) q = q.eq('location_id', filters.locationId)
  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.search) q = q.ilike('vin', `%${filters.search}%`)

  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function upsertFMCVehicle(vehicle: Record<string, any>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('fmc_vehicle_inventory')
    .upsert({ ...vehicle, updated_at: new Date().toISOString() })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function getFMCReports(fmcAccountId: string, filters?: { locationId?: string; search?: string; startDate?: string; endDate?: string }) {
  const supabase = createClient()
  let q = supabase
    .from('vehicle_inspections')
    .select('*, user_profiles(full_name)')
    .eq('company_id', fmcAccountId)
    .eq('status', 'completed')

  if (filters?.search) q = q.ilike('vin', `%${filters.search}%`)
  if (filters?.startDate) q = q.gte('created_at', filters.startDate)
  if (filters?.endDate) q = q.lte('created_at', filters.endDate)

  const { data, error } = await q.order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return data ?? []
}

export async function getFMCDashboardStats(fmcAccountId: string) {
  const supabase = createClient()
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [locations, pending, completedMonth, activeVehicles, avgScore] = await Promise.all([
    supabase.from('fmc_locations').select('id', { count: 'exact', head: true }).eq('fmc_account_id', fmcAccountId).eq('active', true),
    supabase.from('fmc_inspection_requests').select('id', { count: 'exact', head: true }).eq('fmc_account_id', fmcAccountId).in('status', ['pending', 'link_opened', 'in_progress']),
    supabase.from('vehicle_inspections').select('id', { count: 'exact', head: true }).eq('company_id', fmcAccountId).eq('status', 'completed').gte('created_at', monthAgo),
    supabase.from('fmc_vehicle_inventory').select('id', { count: 'exact', head: true }).eq('fmc_account_id', fmcAccountId).in('status', ['active', 'pending_inspection']),
    supabase.from('vehicle_inspections').select('vehicle_score').eq('company_id', fmcAccountId).eq('status', 'completed').gte('created_at', monthAgo),
  ])

  const scores = (avgScore.data ?? []).map((r: any) => r.vehicle_score).filter(Boolean)
  const avg = scores.length > 0 ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : null

  return {
    totalActiveLocations: locations.count ?? 0,
    pendingInspections: pending.count ?? 0,
    completedThisMonth: completedMonth.count ?? 0,
    totalActiveVehicles: activeVehicles.count ?? 0,
    avgConditionScore: avg,
  }
}
