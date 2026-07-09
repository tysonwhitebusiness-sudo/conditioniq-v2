'use server'

import { createAdminClient } from './supabase/admin'
import { authorizeCompanyAccess } from './inspection-auth'

export type VehicleEventType =
  | 'intake'
  | 'spot_assigned'
  | 'spot_unassigned'
  | 'status_changed'
  | 'inspection_completed'
  | 'invoice_generated'
  | 'invoice_sent'
  | 'invoice_paid'
  | 'payment_logged'
  | 'note_added'
  | 'released'

export interface VehicleEvent {
  id: string
  company_id: string
  vehicle_id: string
  event_type: VehicleEventType
  description: string
  metadata: Record<string, unknown> | null
  created_by: string | null
  created_at: string
}

// Best-effort, append-only audit log insert. Never throws — a logging failure
// must never block the real action it's describing.
export async function logVehicleEvent({
  companyId,
  vehicleId,
  eventType,
  description,
  metadata,
  createdBy,
}: {
  companyId: string
  vehicleId: string
  eventType: VehicleEventType
  description: string
  metadata?: Record<string, unknown> | null
  createdBy?: string | null
}): Promise<void> {
  try {
    const ok = await authorizeCompanyAccess(companyId)
    if (!ok) { console.error('[vehicle-events] unauthorized', companyId); return }

    const supabase = createAdminClient()
    const { error } = await supabase.from('vehicle_events').insert({
      company_id: companyId,
      vehicle_id: vehicleId,
      event_type: eventType,
      description,
      metadata: metadata ?? null,
      created_by: createdBy ?? null,
    })
    if (error) console.error('[vehicle-events] insert failed', error)
  } catch (err) {
    console.error('[vehicle-events] insert threw', err)
  }
}

export async function getVehicleEvents(vehicleId: string): Promise<(VehicleEvent & { created_by_name: string | null })[]> {
  const admin = createAdminClient()
  const { data: vehicle } = await admin.from('storage_vehicles').select('company_id').eq('id', vehicleId).maybeSingle()
  if (!vehicle) return []
  const ok = await authorizeCompanyAccess(vehicle.company_id)
  if (!ok) return []

  const supabase = createAdminClient()
  const { data: events, error } = await supabase
    .from('vehicle_events')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('created_at', { ascending: false })
  if (error) { console.error('[vehicle-events] fetch failed', error); return [] }
  if (!events?.length) return []

  const userIds = Array.from(new Set(events.map(e => e.created_by).filter((id): id is string => !!id)))
  let names: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .in('id', userIds)
    names = Object.fromEntries((profiles ?? []).map(p => [p.id, p.full_name ?? p.email ?? 'Unknown']))
  }

  return events.map(e => ({ ...e, created_by_name: e.created_by ? (names[e.created_by] ?? 'Unknown') : null }))
}

export interface CompanyVehicleEvent extends VehicleEvent {
  created_by_name: string | null
  vehicle_label: string | null
}

// Cross-vehicle activity feed for the dashboard's "Recent Activity" section.
export async function getCompanyVehicleEvents(companyId: string, limit = 15): Promise<CompanyVehicleEvent[]> {
  const ok = await authorizeCompanyAccess(companyId)
  if (!ok) return []

  const supabase = createAdminClient()
  const { data: events, error } = await supabase
    .from('vehicle_events')
    .select('*, vehicle:storage_vehicles(vin, year, make, model)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) { console.error('[vehicle-events] company fetch failed', error); return [] }
  if (!events?.length) return []

  const userIds = Array.from(new Set(events.map(e => e.created_by).filter((id): id is string => !!id)))
  let names: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .in('id', userIds)
    names = Object.fromEntries((profiles ?? []).map(p => [p.id, p.full_name ?? p.email ?? 'Unknown']))
  }

  return events.map((e: any) => {
    const v = e.vehicle
    const vehicleLabel = v ? ([v.year, v.make, v.model].filter(Boolean).join(' ') || v.vin || null) : null
    const { vehicle, ...rest } = e
    return { ...rest, created_by_name: e.created_by ? (names[e.created_by] ?? 'Unknown') : null, vehicle_label: vehicleLabel }
  })
}
