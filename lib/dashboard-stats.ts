import { createClient } from '@/lib/supabase/client'
import { calculateVehicleBilling } from '@/lib/lot-actions'
import { getCompanyStatusDefaults, getCustomerStatusOverrides, getCustomerRateOverride } from '@/lib/billing-defaults-actions'
import type { WorkOrderStatus } from '@/lib/work-order-status'

// Same 3 statuses as getSpotPinColor()'s amber bucket — kept as a separate
// literal list rather than importing that function's private set, since this
// queries the DB directly (an `in` filter) rather than classifying a status
// value already in hand.
const ATTENTION_STATUSES = ['on_lot_pending_repairs', 'on_hold', 'pending_release']

// Counted with a real row select rather than { head: true }, and the error is
// surfaced rather than collapsed into 0 — a silently-failing count renders an
// empty dashboard that looks like real data, which is worse than an obvious break.
const NON_OCCUPYING_STATUSES = ['pending_arrival', 'released']

export async function getVehiclesOnLotCount(companyId: string): Promise<number> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('storage_vehicles')
    .select('id')
    .eq('company_id', companyId)
    .not('work_order_status', 'in', `(${NON_OCCUPYING_STATUSES.join(',')})`)
  if (error) {
    console.error('[dashboard-stats] getVehiclesOnLotCount failed:', error)
    throw error
  }
  return data?.length ?? 0
}

// "Arriving today" — there's no dedicated expected-arrival-date field on
// storage_vehicles; a pending_arrival row's arrived_at is set to "now" at
// creation time (see addVehicleToSystem), so this is really "added to the
// system today while still pending," the closest available proxy.
export async function getArrivalsTodayCount(companyId: string): Promise<number> {
  const supabase = createClient()
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('storage_vehicles')
    .select('id')
    .eq('company_id', companyId)
    .eq('work_order_status', 'pending_arrival')
    .gte('arrived_at', startOfDay.toISOString())
  if (error) {
    console.error('[dashboard-stats] getArrivalsTodayCount failed:', error)
    throw error
  }
  return data?.length ?? 0
}

export async function getNeedsAttentionCount(companyId: string): Promise<number> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('storage_vehicles')
    .select('id')
    .eq('company_id', companyId)
    .in('work_order_status', ATTENTION_STATUSES)
  if (error) {
    console.error('[dashboard-stats] getNeedsAttentionCount failed:', error)
    throw error
  }
  return data?.length ?? 0
}

export interface TodaysQueueVehicle {
  id: string
  vin: string
  year: string | null
  make: string | null
  model: string | null
  work_order_status: WorkOrderStatus
}

export interface TodaysQueue {
  arrivingToday: TodaysQueueVehicle[]
  readyForRelease: TodaysQueueVehicle[]
  needsStatusUpdate: TodaysQueueVehicle[]
}

// Shared by the Vehicles list's Today strip and the Dashboard's Today's Queue
// — one query set, not duplicated per page. "Needs status update" = active
// (non pending_arrival, non released) and work_order_status hasn't changed in
// over 24h, using updated_at, which updateWorkOrderStatus() always bumps on a
// real status change.
export async function getTodaysQueue(companyId: string): Promise<TodaysQueue> {
  const supabase = createClient()
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const SELECT = 'id, vin, year, make, model, work_order_status'

  const [arriving, ready, stale] = await Promise.all([
    supabase.from('storage_vehicles').select(SELECT)
      .eq('company_id', companyId).eq('work_order_status', 'pending_arrival')
      .gte('arrived_at', startOfDay.toISOString()),
    supabase.from('storage_vehicles').select(SELECT)
      .eq('company_id', companyId).eq('work_order_status', 'ready_for_release'),
    supabase.from('storage_vehicles').select(SELECT)
      .eq('company_id', companyId)
      .not('work_order_status', 'in', '(pending_arrival,released)')
      .lt('updated_at', staleThreshold),
  ])

  return {
    arrivingToday: (arriving.data ?? []) as TodaysQueueVehicle[],
    readyForRelease: (ready.data ?? []) as TodaysQueueVehicle[],
    needsStatusUpdate: (stale.data ?? []) as TodaysQueueVehicle[],
  }
}

export async function getInspectionsCompletedTodayCount(companyId: string): Promise<number> {
  const supabase = createClient()
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  // No completed_at column exists on vehicle_inspections — report_generated_at
  // is set at completion time and is the same field the Inspection History
  // section already treats as the completion timestamp.
  const { count } = await supabase
    .from('vehicle_inspections')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'completed')
    .gte('report_generated_at', startOfDay.toISOString())
  return count ?? 0
}

// This phase (Service Logging / status-based billable defaults) owns this math;
// Phase 6 (Lot Map) will later read it for its own revenue stat bar but doesn't
// build any of it. Deliberately does NOT go through lib/lot-actions.ts's
// getLotSpots() — that function backs the Lot Map's own protected components,
// and this phase stays fully isolated from Lot Map, so this queries active
// spot assignments independently instead of extending shared Lot Map plumbing.
export async function getLotDailyAccrual(companyId: string, locationId?: string | null): Promise<number> {
  const supabase = createClient()

  let query = supabase
    .from('lot_vehicle_assignments')
    .select(`
      vehicle:storage_vehicles!inner(arrived_at, released_at, billing_type, daily_rate, monthly_rate, work_order_status, customer_id),
      spot:lot_spots!inner(company_id, location_id)
    `)
    .is('unassigned_at', null)
    .eq('spot.company_id', companyId)
  if (locationId) query = query.eq('spot.location_id', locationId)
  else if (locationId === null) query = query.is('spot.location_id', null)

  const [{ data: assignments }, companyRes, statusDefaults] = await Promise.all([
    query,
    supabase.from('companies').select('default_daily_rate, default_monthly_rate, default_billing_type').eq('id', companyId).single(),
    getCompanyStatusDefaults(companyId),
  ])

  const defaults = companyRes.data ?? {}
  const vehicles = (assignments ?? []).map((a: any) => a.vehicle).filter(Boolean)

  const customerIds = Array.from(new Set(vehicles.map((v: any) => v.customer_id).filter(Boolean))) as string[]
  const [rateEntries, statusOverrideEntries] = await Promise.all([
    Promise.all(customerIds.map(async id => [id, await getCustomerRateOverride(id)] as const)),
    Promise.all(customerIds.map(async id => [id, await getCustomerStatusOverrides(id)] as const)),
  ])
  const rateByCustomer = new Map(rateEntries)
  const statusOverrideByCustomer = new Map(statusOverrideEntries)

  return vehicles.reduce((sum: number, v: any) => {
    const customer = v.customer_id ? rateByCustomer.get(v.customer_id) : null
    const customerStatusOverride = v.customer_id ? statusOverrideByCustomer.get(v.customer_id) : null
    const result = calculateVehicleBilling(v, defaults, statusDefaults, customer, customerStatusOverride)
    if (result.rate === null || !result.isBillable) return sum
    return sum + (result.billingType === 'daily' ? result.rate : result.rate / 30)
  }, 0)
}
