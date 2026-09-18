'use server'

import { createClient } from '@/lib/supabase/server'
import {
  getPlan, normalizePlanKey, effectiveMonthlyPrice, calcOverage, PLANS, type CompanyPlanFields,
} from '@/lib/pricing'
import { computeUsageState, type UsageState } from '@/lib/usage-state'
import { calendarMonth } from '@/lib/plan-usage'
import { captureHighSeverityError } from './sentry'

export async function requireSuperAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const err = new Error('requireSuperAdmin: not authenticated')
    captureHighSeverityError(err, { reason: 'not_authenticated', scope: 'requireSuperAdmin' })
    throw err
  }

  const { data: isOwner } = await supabase.rpc('is_platform_owner')
  if (!isOwner) {
    const err = new Error('requireSuperAdmin: not authorized')
    captureHighSeverityError(err, { userId: user.id, reason: 'not_authorized', scope: 'requireSuperAdmin' }, user.id)
    throw err
  }

  return user
}

// Usage for the admin screens, derived the same way the app derives it for a
// customer. companies.reports_used is no longer maintained and is not read.
export interface AdminCompanyUsage {
  planKey: string
  planName: string
  reportsUsed: number
  reportsIncluded: number | null
  peakVehicles: number
  vehiclesIncluded: number | null
  monthlyPrice: number | null
  hasPriceOverride: boolean
}

function summarize(company: Record<string, any>, usage: UsageState): AdminCompanyUsage {
  const plan = getPlan(company.subscription_tier)
  return {
    planKey: plan.key,
    planName: plan.name,
    reportsUsed: usage.used,
    reportsIncluded: usage.included,
    peakVehicles: usage.vehicles.used,
    vehiclesIncluded: usage.vehicles.included,
    monthlyPrice: effectiveMonthlyPrice(company),
    hasPriceOverride: company.price_override_monthly != null || company.price_override_annual != null,
  }
}

type CompanyWithUsage = Record<string, any> & { usage: AdminCompanyUsage; usageState: UsageState }

async function withUsage(supabase: any, companies: Record<string, any>[]): Promise<CompanyWithUsage[]> {
  return Promise.all(companies.map(async (c): Promise<CompanyWithUsage> => {
    const usageState = await computeUsageState(supabase, c.id)
    return Object.assign({}, c, { usage: summarize(c, usageState), usageState })
  }))
}

export async function getAdminStats() {
  await requireSuperAdmin()
  const supabase = createClient()
  // Generated reports in the calendar month (UTC), the same rows usage and
  // Pay Per Use invoices count. This used to count inspections started in the
  // last 30 days, which matched neither.
  const month = calendarMonth(new Date())

  const [companies, reports, recentActivity] = await Promise.all([
    supabase.from('companies').select('*'),
    supabase.from('vehicle_inspections').select('id', { count: 'exact', head: true })
      .not('report_generated_at', 'is', null)
      .gte('report_generated_at', month.start.toISOString())
      .lt('report_generated_at', month.end.toISOString()),
    supabase.from('vehicle_inspections').select('id, vin, company_id, created_at, companies(name)').order('created_at', { ascending: false }).limit(20),
  ])

  const enriched = await withUsage(supabase, (companies.data ?? []) as Record<string, any>[])

  // Custom-priced (Enterprise) and demo accounts contribute nothing to MRR.
  const mrr = enriched.reduce((sum, c) => sum + (c.usage.monthlyPrice ?? 0), 0)
  const trialCount = enriched.filter(c => c.usage.planKey === 'demo').length

  // Every account, not just the top ten shown in the usage list.
  const planBreakdown: Record<string, number> = {}
  for (const c of enriched) planBreakdown[c.usage.planKey] = (planBreakdown[c.usage.planKey] ?? 0) + 1

  const topCustomers = enriched
    .map(c => ({ ...c, accountAgeDays: Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000) }))
    .sort((a, b) => b.usage.reportsUsed - a.usage.reportsUsed)
    .slice(0, 10)
    .map(({ usageState: _omit, ...rest }) => rest)

  return {
    mrr,
    activeCustomers: enriched.length,
    reportsThisMonth: reports.count ?? 0,
    planBreakdown,
    trialAccounts: trialCount,
    topCustomers,
    recentActivity: recentActivity.data ?? [],
  }
}

export async function getMRRByMonth() {
  await requireSuperAdmin()
  const supabase = createClient()
  const { data: companies } = await supabase.from('companies').select('*')
  const months = []
  for (let i = 11; i >= 0; i--) {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() - i)
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59)
    // Uses each account's current price. There is no price history, so this is
    // a reconstruction, not a record of what was billed in past months.
    const mrr = (companies ?? []).reduce((sum: number, c: Record<string, any>) => {
      if (new Date(c.created_at) <= monthEnd) return sum + (effectiveMonthlyPrice(c) ?? 0)
      return sum
    }, 0)
    months.push({ month: date.toLocaleDateString('en-US', { month: 'short' }), mrr })
  }
  return months
}

export async function getRecentCustomerActivity(limit = 10) {
  await requireSuperAdmin()
  const supabase = createClient()
  const { data } = await supabase
    .from('companies')
    .select('id, name, subscription_tier, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map((c: Record<string, unknown>) => ({
    id: c.id, company_name: c.name, event: 'signup', description: 'New customer signup',
    plan: getPlan(c.subscription_tier as string).key, timestamp: c.created_at,
  }))
}

export async function getAllCompanies() {
  await requireSuperAdmin()
  const supabase = createClient()
  const { data, error } = await supabase.from('companies').select('*').order('created_at', { ascending: false })
  if (error) throw error
  const enriched = await withUsage(supabase, (data ?? []) as Record<string, any>[])
  return enriched.map(({ usageState: _omit, ...rest }) => rest)
}

export async function getCompanyById(companyId: string) {
  await requireSuperAdmin()
  const supabase = createClient()
  const { data, error } = await supabase.from('companies').select('*').eq('id', companyId).single()
  if (error) throw error
  return data
}

export async function getCompanyUsage(companyId: string): Promise<UsageState> {
  await requireSuperAdmin()
  return computeUsageState(createClient(), companyId)
}

// Pay Per Use accounts for the admin overview: each account's reports and
// dollars this month so far and last month (the figure to invoice), plus totals.
export interface PayPerUseAccountRow {
  id: string
  name: string
  thisMonthReports: number
  thisMonthAmount: number
  lastMonthReports: number
  lastMonthAmount: number
}

export async function getPayPerUseOverview(): Promise<{
  rate: number
  thisMonth: { start: string; end: string }
  lastMonth: { start: string; end: string }
  accounts: PayPerUseAccountRow[]
}> {
  await requireSuperAdmin()
  const supabase = createClient()
  const rate = PLANS.pay_per_use.additionalReportCost
  const now = new Date()
  const thisMonth = calendarMonth(now, 0)
  const lastMonth = calendarMonth(now, -1)

  const { data: companies, error } = await supabase.from('companies').select('id, name, subscription_tier')
  if (error) throw error
  const ppu = (companies ?? []).filter((c: { subscription_tier: string }) => getPlan(c.subscription_tier).usageBased)
  const range = { thisMonth: { start: thisMonth.start.toISOString(), end: thisMonth.end.toISOString() }, lastMonth: { start: lastMonth.start.toISOString(), end: lastMonth.end.toISOString() } }
  if (ppu.length === 0) return { rate, ...range, accounts: [] }

  const { data: reports, error: reportsErr } = await supabase
    .from('vehicle_inspections')
    .select('company_id, report_generated_at')
    .in('company_id', ppu.map((c: { id: string }) => c.id))
    .not('report_generated_at', 'is', null)
    .gte('report_generated_at', range.lastMonth.start)
    .lt('report_generated_at', range.thisMonth.end)
  if (reportsErr) throw reportsErr

  const accounts = ppu.map((c: { id: string; name: string }) => {
    const mine = (reports ?? []).filter((r: { company_id: string }) => r.company_id === c.id)
    const thisCount = mine.filter((r: { report_generated_at: string }) => r.report_generated_at >= range.thisMonth.start).length
    const lastCount = mine.length - thisCount
    return {
      id: c.id, name: c.name,
      thisMonthReports: thisCount, thisMonthAmount: thisCount * rate,
      lastMonthReports: lastCount, lastMonthAmount: lastCount * rate,
    }
  }).sort((a: PayPerUseAccountRow, b: PayPerUseAccountRow) => b.lastMonthAmount - a.lastMonthAmount || b.thisMonthAmount - a.thisMonthAmount)

  return { rate, ...range, accounts }
}

// Pay Per Use is invoiced by hand at month end: every generated report in the
// calendar month at the plan rate. Last month is the figure to invoice; this
// month is running.
export interface PayPerUseMonth {
  start: string
  end: string
  reports: number
  rate: number
  amount: number
}

export async function getPayPerUseStatement(companyId: string): Promise<{ lastMonth: PayPerUseMonth; thisMonth: PayPerUseMonth }> {
  await requireSuperAdmin()
  const supabase = createClient()
  const rate = PLANS.pay_per_use.additionalReportCost
  const now = new Date()
  const month = async (offset: number): Promise<PayPerUseMonth> => {
    const { start, end } = calendarMonth(now, offset)
    const { count, error } = await supabase
      .from('vehicle_inspections')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .not('report_generated_at', 'is', null)
      .gte('report_generated_at', start.toISOString())
      .lt('report_generated_at', end.toISOString())
    if (error) throw error
    const reports = count ?? 0
    return { start: start.toISOString(), end: end.toISOString(), reports, rate, amount: reports * rate }
  }
  const [lastMonth, thisMonth] = await Promise.all([month(-1), month(0)])
  return { lastMonth, thisMonth }
}

export async function updateCompanyBilling(
  companyId: string,
  updates: {
    reports_included?: number | null
    billing_cycle_start?: string
    subscription_tier?: string
    billing_interval?: string
    price_override_monthly?: number | null
    price_override_annual?: number | null
    trial_expires_at?: string | null
  }
) {
  await requireSuperAdmin()
  const supabase = createClient()
  const patch: Record<string, unknown> = { ...updates }

  if (updates.subscription_tier !== undefined) {
    const nextPlan = normalizePlanKey(updates.subscription_tier)
    patch.subscription_tier = nextPlan

    // Setting up a demo starts its trial clock. Only on the move into demo, so
    // re-saving an existing demo does not quietly extend it.
    if (nextPlan === 'demo' && updates.trial_expires_at === undefined) {
      const { data: current } = await supabase.from('companies').select('subscription_tier').eq('id', companyId).single()
      if (normalizePlanKey(current?.subscription_tier) !== 'demo') {
        patch.trial_expires_at = new Date(Date.now() + (PLANS.demo.trialDays ?? 14) * 86400000).toISOString()
      }
    }
  }

  const { error } = await supabase.from('companies').update(patch).eq('id', companyId)
  if (error) throw error
}

export async function getCompanyInspections(companyId: string, limit = 10) {
  await requireSuperAdmin()
  const supabase = createClient()
  const { data } = await supabase
    .from('vehicle_inspections')
    .select('id, vin, make, model, year, created_at, status, usage_status, vehicle_score, report_url, inspector:user_profiles!inspector_id(full_name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

// Accounts over their allowance this cycle, with the overage owed. Covers both
// meters: reports and peak vehicles on lot.
export async function getOverageTracker() {
  await requireSuperAdmin()
  const supabase = createClient()
  const { data } = await supabase.from('companies').select('*')
  const enriched = await withUsage(supabase, (data ?? []) as Record<string, any>[])
  return enriched
    // Pay Per Use has no allowance to exceed; its reports are the bill itself and
    // are shown on the customer page instead.
    .filter(c => !getPlan(c.subscription_tier).usageBased)
    .map(c => {
      const breakdown = calcOverage(c as CompanyPlanFields, { reportsUsed: c.usage.reportsUsed, peakVehicles: c.usage.peakVehicles })
      return {
        id: c.id,
        name: c.name,
        subscription_tier: c.usage.planKey,
        planName: c.usage.planName,
        overageCount: breakdown.reports.over,
        vehicleOverageCount: breakdown.vehicles.over,
        overageRevenue: breakdown.total,
      }
    })
    .filter(c => c.overageRevenue > 0 || c.overageCount > 0 || c.vehicleOverageCount > 0)
}
