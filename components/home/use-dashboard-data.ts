import { useState, useEffect, useCallback } from 'react'
import { useFeatureFlag } from '@/hooks/use-feature-flag'
import { checkUsageState } from '@/lib/usage-actions'
import { getLotOccupancy, getLotSpots, getLotShapes } from '@/lib/lot-actions'
import type { LotSpot, LotShape } from '@/lib/lot-actions'
import { getBillingKPIs } from '@/lib/billing-dashboard-actions'
import {
  getInspectionsCompletedTodayCount, getVehiclesOnLotCount, getLotDailyAccrual,
  getArrivalsTodayCount, getNeedsAttentionCount, getTodaysQueue, type TodaysQueue,
} from '@/lib/dashboard-stats'
import { getCustomerCount } from '@/lib/customer-actions'
import { getCompanyVehicleEvents, type CompanyVehicleEvent } from '@/lib/vehicle-events-actions'

export function useDashboardData(companyId: string) {
  const lotMapEnabled = useFeatureFlag('lot_map')
  const lotBillingEnabled = useFeatureFlag('lot_billing')

  const [vehiclesOnLot, setVehiclesOnLot] = useState(0)
  const [usageState, setUsageState] = useState<any>(null)
  const [lotOccupancy, setLotOccupancy] = useState<{ total: number; occupied: number } | null>(null)
  const [dailyAccrual, setDailyAccrual] = useState(0)
  const [overdueCount, setOverdueCount] = useState(0)
  const [inspectionsToday, setInspectionsToday] = useState(0)
  const [customerCount, setCustomerCount] = useState(0)
  const [events, setEvents] = useState<CompanyVehicleEvent[]>([])
  const [expiringCount, setExpiringCount] = useState(0)
  const [arrivalsToday, setArrivalsToday] = useState(0)
  const [needsAttention, setNeedsAttention] = useState(0)
  const [todaysQueue, setTodaysQueue] = useState<TodaysQueue | null>(null)
  const [lotSpots, setLotSpots] = useState<LotSpot[]>([])
  const [lotShapes, setLotShapes] = useState<LotShape[]>([])

  // The core stats do not depend on any feature flag, so they are loaded on
  // their own effect keyed only to companyId. Previously they shared a callback
  // whose deps included two useFeatureFlag values, each of which starts as null
  // and resolves to a boolean asynchronously — every resolution rebuilt the
  // callback, re-ran the effect, and aborted the in-flight request batch. One
  // aborted promise rejected the whole Promise.all, so no setState ran and every
  // counter stayed at its initial 0.
  const loadCore = useCallback(async () => {
    if (!companyId) return
    const cutoff20h = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { createClient } = await import('@/lib/supabase/client')

    // allSettled, not all — one failing stat must not blank the whole dashboard.
    const results = await Promise.allSettled([
      getVehiclesOnLotCount(companyId),
      checkUsageState(companyId),
      getInspectionsCompletedTodayCount(companyId),
      getCustomerCount(companyId),
      getCompanyVehicleEvents(companyId, 8),
      createClient()
        .from('vehicle_inspections')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'in_progress')
        .is('locked_at', null)
        .gte('last_active_at', cutoff24h)
        .lte('last_active_at', cutoff20h),
      getArrivalsTodayCount(companyId),
      getNeedsAttentionCount(companyId),
      getTodaysQueue(companyId),
    ])
    const at = <T,>(i: number, fallback: T): T =>
      results[i].status === 'fulfilled' ? ((results[i] as PromiseFulfilledResult<T>).value ?? fallback) : fallback

    setVehiclesOnLot(at(0, 0))
    setUsageState(at<any>(1, null))
    setInspectionsToday(at(2, 0))
    setCustomerCount(at(3, 0))
    setEvents(at<CompanyVehicleEvent[]>(4, []))
    const expiring = at<{ error: unknown; count: number | null } | null>(5, null)
    setExpiringCount(expiring && !expiring.error ? (expiring.count ?? 0) : 0)
    setArrivalsToday(at(6, 0))
    setNeedsAttention(at(7, 0))
    setTodaysQueue(at<TodaysQueue | null>(8, null))
  }, [companyId])

  const loadLot = useCallback(async () => {
    if (!companyId || !lotMapEnabled) return
    const [occ, accrual, spots, shapes] = await Promise.all([
      getLotOccupancy(companyId), getLotDailyAccrual(companyId),
      getLotSpots(companyId), getLotShapes(companyId),
    ])
    setLotOccupancy(occ)
    setDailyAccrual(accrual)
    setLotSpots(spots)
    setLotShapes(shapes)
  }, [companyId, lotMapEnabled])

  const loadBilling = useCallback(async () => {
    if (!companyId || !lotBillingEnabled) return
    const kpis = await getBillingKPIs(companyId)
    setOverdueCount(kpis.overdueCount)
  }, [companyId, lotBillingEnabled])

  useEffect(() => { loadCore() }, [loadCore])
  useEffect(() => { loadLot() }, [loadLot])
  useEffect(() => { loadBilling() }, [loadBilling])

  return {
    lotMapEnabled, lotBillingEnabled,
    vehiclesOnLot, usageState, lotOccupancy, dailyAccrual, overdueCount,
    inspectionsToday, customerCount, events, expiringCount,
    arrivalsToday, needsAttention, todaysQueue, lotSpots, lotShapes,
  }
}
