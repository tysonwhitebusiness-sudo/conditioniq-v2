import {
  getPlan, effectiveReportsIncluded, usageRatio, NEAR_LIMIT_RATIO, type Plan,
} from '@/lib/pricing'
import { currentBillingCycle, vehicleOccupancy, type BillingCycle } from '@/lib/plan-usage'

// Usage for one account, computed from source rows rather than stored counters.
//
// Reports: vehicle_inspections with report_generated_at inside the current cycle
// (locked decision 08). The companies.reports_used counter is no longer read or
// written — it was non-atomic, not idempotent, and had drifted roughly 10x.
//
// The client is a parameter so the same rules serve both display (RLS-scoped
// client) and enforcement (admin client inside server actions).

export interface MeterState {
  used: number
  included: number | null        // null = unlimited
  remaining: number | null
  percentUsed: number            // 0 when unlimited
  isOverage: boolean
  isNearLimit: boolean           // at or above 80%
  overageRate: number
}

export interface DemoState {
  isDemo: boolean
  expiresAt: string | null
  expired: boolean
  reportsExhausted: boolean
}

export interface UsageState {
  // Report meter, kept at the top level so existing consumers read it unchanged.
  used: number
  included: number | null
  remaining: number | null
  percentUsed: number
  isOverage: boolean
  isNearLimit: boolean
  overageRate: number

  planName: string
  planKey: string
  vehicles: MeterState & { current: number }
  cycle: { start: string; end: string }
  demo: DemoState
  // False when a demo has ended. In-progress inspections can still be finished;
  // only starting a new one is blocked.
  canStartInspection: boolean
  blockReason: string | null
}

interface CompanyRow {
  subscription_tier: string | null
  reports_included: number | null
  billing_cycle_start: string | null
  trial_expires_at: string | null
}

function meter(used: number, included: number | null, rate: number): MeterState {
  const ratio = usageRatio(used, included)
  return {
    used,
    included,
    remaining: included === null ? null : Math.max(0, included - used),
    percentUsed: ratio === null ? 0 : ratio * 100,
    isOverage: included !== null && used >= included,
    isNearLimit: ratio !== null && ratio >= NEAR_LIMIT_RATIO,
    overageRate: rate,
  }
}

export function demoBlockReason(demo: DemoState): string | null {
  if (!demo.isDemo) return null
  if (demo.expired) return 'Your 14-day demo has ended. Upgrade your plan to start new inspections and check-ins. Everything you have already recorded stays available.'
  if (demo.reportsExhausted) return 'You have used all 5 demo reports. Upgrade your plan to start new inspections and check-ins. Everything you have already recorded stays available.'
  return null
}

export async function computeUsageState(
  supabase: any,
  companyId: string,
  now: Date = new Date(),
): Promise<UsageState> {
  const { data: company } = await supabase
    .from('companies')
    .select('subscription_tier, reports_included, billing_cycle_start, trial_expires_at')
    .eq('id', companyId)
    .maybeSingle() as { data: CompanyRow | null }

  const plan: Plan = getPlan(company?.subscription_tier)
  const cycle: BillingCycle = currentBillingCycle(company?.billing_cycle_start, now)
  const isDemo = plan.key === 'demo'

  // A demo's report allowance covers the whole trial, not a single cycle.
  let reportQuery = supabase
    .from('vehicle_inspections')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .not('report_generated_at', 'is', null)
  if (!isDemo) {
    reportQuery = reportQuery
      .gte('report_generated_at', cycle.start.toISOString())
      .lt('report_generated_at', cycle.end.toISOString())
  }

  const [reportsRes, vehiclesRes] = await Promise.all([
    reportQuery,
    supabase
      .from('storage_vehicles')
      .select('arrived_at, released_at, work_order_status')
      .eq('company_id', companyId)
      .lt('arrived_at', cycle.end.toISOString())
      .or(`released_at.is.null,released_at.gte.${cycle.start.toISOString()}`),
  ])
  if (reportsRes.error) throw reportsRes.error
  if (vehiclesRes.error) throw vehiclesRes.error

  const reportsUsed = reportsRes.count ?? 0
  const reports = meter(reportsUsed, company ? effectiveReportsIncluded(company) : plan.reportsIncluded, plan.additionalReportCost)
  const occupancy = vehicleOccupancy(vehiclesRes.data ?? [], cycle, now)
  const vehicleMeter = meter(occupancy.peak, plan.vehiclesIncluded, plan.additionalVehicleCost)
  // Reports flag overage at the limit because the next report is billable.
  // Vehicles are billed on the peak itself, so exactly at the allowance is not over.
  vehicleMeter.isOverage = plan.vehiclesIncluded !== null && occupancy.peak > plan.vehiclesIncluded
  const vehicles = { ...vehicleMeter, current: occupancy.current }

  const expiresAt = company?.trial_expires_at ?? null
  const demo: DemoState = {
    isDemo,
    expiresAt,
    expired: isDemo && expiresAt !== null && now.getTime() >= new Date(expiresAt).getTime(),
    reportsExhausted: isDemo && reports.included !== null && reports.used >= reports.included,
  }
  const blockReason = demoBlockReason(demo)

  return {
    ...reports,
    planName: plan.name,
    planKey: plan.key,
    vehicles,
    cycle: { start: cycle.start.toISOString(), end: cycle.end.toISOString() },
    demo,
    canStartInspection: blockReason === null,
    blockReason,
  }
}

// Server-side guard for any action that starts a new inspection. Returns the
// block reason, or null when the account may start one.
export async function inspectionStartBlockReason(supabase: any, companyId: string): Promise<string | null> {
  const state = await computeUsageState(supabase, companyId)
  return state.blockReason
}
