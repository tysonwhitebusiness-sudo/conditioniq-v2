'use server'

import { createClient } from '@/lib/supabase/server'
import { getPlan } from '@/lib/pricing'
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

export async function getAdminStats() {
  await requireSuperAdmin()
  const supabase = createClient()
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [companies, reports, recentActivity] = await Promise.all([
    supabase.from('companies').select('id, name, subscription_tier, reports_used, reports_included, billing_cycle_start, created_at'),
    supabase.from('vehicle_inspections').select('id, company_id, created_at').gte('created_at', monthAgo),
    supabase.from('vehicle_inspections').select('id, vin, company_id, created_at, companies(name)').order('created_at', { ascending: false }).limit(20),
  ])

  const companiesData = (companies.data ?? []) as Record<string, unknown>[]
  let mrr = 0
  let trialCount = 0
  companiesData.forEach(c => {
    const plan = getPlan(c.subscription_tier as string)
    mrr += plan.monthlyCost
    if (c.subscription_tier === 'demo') trialCount++
  })

  const topCustomers = companiesData
    .map(c => ({ ...c, accountAgeDays: Math.floor((Date.now() - new Date(c.created_at as string).getTime()) / 86400000) }))
    .sort((a, b) => ((b as any).reports_used as number) - ((a as any).reports_used as number))
    .slice(0, 10)

  return {
    mrr,
    activeCustomers: companiesData.length,
    reportsThisMonth: (reports.data ?? []).length,
    trialAccounts: trialCount,
    topCustomers,
    recentActivity: recentActivity.data ?? [],
  }
}

export async function getMRRByMonth() {
  await requireSuperAdmin()
  const supabase = createClient()
  const { data: companies } = await supabase.from('companies').select('id, subscription_tier, created_at')
  const months = []
  for (let i = 11; i >= 0; i--) {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() - i)
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59)
    const mrr = (companies ?? []).reduce((sum: number, c: Record<string, unknown>) => {
      if (new Date(c.created_at as string) <= monthEnd) return sum + getPlan(c.subscription_tier as string).monthlyCost
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
    id: c.id, company_name: c.name, event: 'signup', description: 'New customer signup', plan: c.subscription_tier, timestamp: c.created_at,
  }))
}

export async function getAllCompanies() {
  await requireSuperAdmin()
  const supabase = createClient()
  const { data, error } = await supabase.from('companies').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getCompanyById(companyId: string) {
  await requireSuperAdmin()
  const supabase = createClient()
  const { data, error } = await supabase.from('companies').select('*').eq('id', companyId).single()
  if (error) throw error
  return data
}

export async function updateCompanyBilling(
  companyId: string,
  updates: {
    reports_used?: number
    reports_included?: number
    billing_cycle_start?: string
    subscription_tier?: string
    billing_interval?: string
    legacy_pricing?: boolean
  }
) {
  await requireSuperAdmin()
  const supabase = createClient()
  await supabase.from('companies').update(updates).eq('id', companyId)
}

export async function getCompanyInspections(companyId: string, limit = 10) {
  await requireSuperAdmin()
  const supabase = createClient()
  const { data } = await supabase
    .from('vehicle_inspections')
    .select('id, vin, make, model, year, created_at, status, usage_status, vehicle_score, inspector:user_profiles!inspector_id(full_name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function getOverageTracker() {
  await requireSuperAdmin()
  const supabase = createClient()
  const { data } = await supabase.from('companies').select('id, name, subscription_tier, reports_used, reports_included').gt('reports_used', 0)
  return (data ?? []).map((c: Record<string, unknown>) => {
    const plan = getPlan(c.subscription_tier as string)
    const overage = Math.max(0, (c.reports_used as number) - (c.reports_included as number))
    return { ...c, planName: plan.name, overageCount: overage, overageRevenue: overage * plan.additionalReportCost }
  }).filter((c: Record<string, unknown>) => (c.overageCount as number) > 0)
}
