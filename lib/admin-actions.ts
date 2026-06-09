'use server'

import { createClient } from '@/lib/supabase/server'
import { getPlan } from '@/lib/pricing'

export async function getAdminStats() {
  const supabase = createClient()
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [companies, reports, recentActivity] = await Promise.all([
    supabase.from('companies').select('id, name, subscription_tier, reports_used, reports_included, billing_cycle_start, created_at'),
    supabase.from('vehicle_inspections').select('id, company_id, created_at').gte('created_at', monthAgo),
    supabase.from('vehicle_inspections').select('id, vin, company_id, created_at, companies(name)').order('created_at', { ascending: false }).limit(20),
  ])

  const companiesData = companies.data ?? []
  let mrr = 0
  let trialCount = 0

  companiesData.forEach((c: any) => {
    const plan = getPlan(c.subscription_tier)
    mrr += plan.monthlyCost
    if (c.subscription_tier === 'demo') trialCount++
  })

  const reportsByCompany: Record<string, number> = {}
  ;(reports.data ?? []).forEach((r: any) => {
    reportsByCompany[r.company_id] = (reportsByCompany[r.company_id] ?? 0) + 1
  })

  const topCustomers = companiesData
    .map((c: any) => ({
      ...c,
      reportsThisMonth: reportsByCompany[c.id] ?? 0,
      accountAgeDays: Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000),
    }))
    .sort((a: any, b: any) => b.reportsThisMonth - a.reportsThisMonth)
    .slice(0, 10)

  return {
    mrr,
    activeCustomers: companiesData.length,
    reportsThisMonth: reports.count ?? (reports.data ?? []).length,
    avgReportsPerCustomer: companiesData.length > 0 ? Math.round((reports.data ?? []).length / companiesData.length) : 0,
    trialAccounts: trialCount,
    topCustomers,
    recentActivity: recentActivity.data ?? [],
  }
}

export async function getAllCompanies() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('companies')
    .select('*, user_profiles(id, full_name, email, role)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function updateCompanyBilling(
  companyId: string,
  updates: { reports_used?: number; reports_included?: number; billing_cycle_start?: string; subscription_tier?: string }
) {
  const supabase = createClient()
  await supabase.from('companies').update(updates).eq('id', companyId)
}

export async function getCompanyInspections(companyId: string, limit = 20) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('vehicle_inspections')
    .select('id, vin, make, model, year, created_at, status, vehicle_score, user_profiles(full_name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function getCompanyNotes(companyId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('company_notes')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function addCompanyNote(companyId: string, note: string) {
  const supabase = createClient()
  await supabase.from('company_notes').insert({ company_id: companyId, note })
}

export async function getSystemBroadcasts() {
  const supabase = createClient()
  const { data } = await supabase.from('system_broadcasts').select('*').eq('is_active', true).order('created_at', { ascending: false })
  return data ?? []
}

export async function createSystemBroadcast(message: string) {
  const supabase = createClient()
  await supabase.from('system_broadcasts').insert({ message, is_active: true })
}

export async function deactivateBroadcast(id: string) {
  const supabase = createClient()
  await supabase.from('system_broadcasts').update({ is_active: false }).eq('id', id)
}

export async function getOverageTracker() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, subscription_tier, reports_used, reports_included')
    .gt('reports_used', 0)

  if (error) throw error

  return (data ?? []).map((c: any) => {
    const plan = getPlan(c.subscription_tier)
    const overage = Math.max(0, c.reports_used - c.reports_included)
    return {
      ...c,
      planName: plan.name,
      limit: c.reports_included,
      overageCount: overage,
      overageRevenue: overage * plan.additionalReportCost,
    }
  }).filter((c: any) => c.overageCount > 0)
}
