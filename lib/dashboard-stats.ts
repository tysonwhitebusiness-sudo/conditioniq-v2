import { createClient } from '@/lib/supabase/client'
import { getLotSpots, calculateVehicleBilling } from '@/lib/lot-actions'

export type SimpleVehicleStatus = 'pending_arrival' | 'on_lot' | 'picked_up'

// Same bucketing the home dashboard already uses to group storage_vehicles
// by lifecycle stage — kept here so both the mobile and desktop dashboards
// (and the on-lot count below) share one definition instead of two.
export function effectiveStatus(v: { lifecycle_status?: string | null; status?: string | null }): SimpleVehicleStatus | null {
  const s = v.lifecycle_status || v.status
  if (s === 'queued' || s === 'pending_arrival' || s === 'pending_inspection') return 'pending_arrival'
  if (s === 'on_lot' || s === 'inspected' || s === 'releasing' || s === 'pending_pickup') return 'on_lot'
  if (s === 'released' || s === 'picked_up') return 'picked_up'
  return null
}

export async function getVehiclesOnLotCount(companyId: string): Promise<number> {
  const supabase = createClient()
  const { data } = await supabase
    .from('storage_vehicles')
    .select('id, lifecycle_status, status')
    .eq('company_id', companyId)
  return (data ?? []).filter(v => effectiveStatus(v) === 'on_lot').length
}

export async function getInspectionsCompletedTodayCount(companyId: string): Promise<number> {
  const supabase = createClient()
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('vehicle_inspections')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'completed')
    .gte('completed_at', startOfDay.toISOString())
  return count ?? 0
}

// Mirrors the exact accrual math storage-lot-view.tsx already uses for the
// Lot Map's "Accruing/day" stat tile — same source functions, same formula,
// just called again here so the dashboard can show the same number.
export async function getLotDailyAccrual(companyId: string, locationId?: string | null): Promise<number> {
  const supabase = createClient()
  const [spots, companyRes] = await Promise.all([
    getLotSpots(companyId, locationId),
    supabase.from('companies').select('default_daily_rate, default_monthly_rate, default_billing_type').eq('id', companyId).single(),
  ])
  const defaults = companyRes.data ?? {}
  return spots.reduce((sum, spot) => {
    if (!spot.active_assignment?.vehicle) return sum
    const result = calculateVehicleBilling(spot.active_assignment.vehicle, defaults)
    if (result.rate === null) return sum
    return sum + (result.billingType === 'daily' ? result.rate : result.rate / 30)
  }, 0)
}
