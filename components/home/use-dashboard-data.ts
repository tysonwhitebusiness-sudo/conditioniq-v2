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
  const dispatchEnabled = useFeatureFlag('dispatch')

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

  const load = useCallback(async () => {
    if (!companyId) return
    const cutoff20h = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { createClient } = await import('@/lib/supabase/client')

    const [vehiclesRes, usage, inspToday, custCount, activity, expiring, arrivals, attention, queue] = await Promise.all([
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
    setVehiclesOnLot(vehiclesRes)
    setUsageState(usage)
    setInspectionsToday(inspToday)
    setCustomerCount(custCount)
    setEvents(activity)
    setExpiringCount(expiring.error ? 0 : (expiring.count ?? 0))
    setArrivalsToday(arrivals)
    setNeedsAttention(attention)
    setTodaysQueue(queue)

    if (lotMapEnabled) {
      const [occ, accrual, spots, shapes] = await Promise.all([
        getLotOccupancy(companyId), getLotDailyAccrual(companyId),
        getLotSpots(companyId), getLotShapes(companyId),
      ])
      setLotOccupancy(occ)
      setDailyAccrual(accrual)
      setLotSpots(spots)
      setLotShapes(shapes)
    }
    if (lotBillingEnabled) {
      const kpis = await getBillingKPIs(companyId)
      setOverdueCount(kpis.overdueCount)
    }
  }, [companyId, lotMapEnabled, lotBillingEnabled])

  useEffect(() => { load() }, [load])

  return {
    lotMapEnabled, lotBillingEnabled, dispatchEnabled,
    vehiclesOnLot, usageState, lotOccupancy, dailyAccrual, overdueCount,
    inspectionsToday, customerCount, events, expiringCount,
    arrivalsToday, needsAttention, todaysQueue, lotSpots, lotShapes,
  }
}
